"""
import_multiyear.py — 다연도 합본 xlsx → JSON 누적 도구

대학알리미에서 여러 연도가 하나의 파일로 합쳐진 자료를 처리한다.
normalize_gui.py와 달리:
  - 공시연도를 파일명이 아닌 규칙(기준연도와 동일 / +1)으로 계산
  - 단일 파일 처리 (폴더 일괄 아님)
  - 컬럼명 매핑만 수행 (CSV 출력 없음)

사용법:
  python import_multiyear.py
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import threading
import json
import pandas as pd
from pathlib import Path

# normalize_gui의 공유 로직 재사용
from normalize_gui import (
    extract_df, resolve_fields, load_mapping, save_mapping,
    parse_학교_field, accumulate_json, validate_df,
    normalize_half_year, item_key_from_filename,
    FieldMappingDialog, SCRIPT_DIR,
)

JSON_DIR = SCRIPT_DIR / "data"


# ─────────────────────────────────────────────────────
# 메인 GUI
# ─────────────────────────────────────────────────────

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("다연도 합본 → JSON 변환")
        self.geometry("680x540")
        self.resizable(True, True)
        self._df_raw = None       # extract_df 결과 (매핑 전)
        self._item_key = ""
        self._build()

    # ── UI 구성 ──────────────────────────────────────

    def _build(self):
        pad = {"padx": 12, "pady": 5}

        # ── 파일 선택 ──
        frm_file = ttk.LabelFrame(self, text="파일 선택")
        frm_file.pack(fill="x", **pad)

        self._file_var = tk.StringVar()
        ttk.Entry(frm_file, textvariable=self._file_var, state="readonly",
                  width=55).grid(row=0, column=0, padx=8, pady=6, sticky="ew")
        ttk.Button(frm_file, text="찾아보기…", command=self._pick_file).grid(
            row=0, column=1, padx=6)
        frm_file.columnconfigure(0, weight=1)

        # ── 항목 키 ──
        frm_key = ttk.LabelFrame(self, text="항목 키 (파일명 자동 입력, 수정 가능)")
        frm_key.pack(fill="x", **pad)
        self._key_var = tk.StringVar()
        ttk.Entry(frm_key, textvariable=self._key_var, width=65).pack(
            fill="x", padx=8, pady=6)

        # ── 공시연도 규칙 ──
        frm_year = ttk.LabelFrame(self, text="공시연도 계산 방식")
        frm_year.pack(fill="x", **pad)

        self._pub_year_offset = tk.IntVar(value=0)
        ttk.Radiobutton(frm_year, text="기준연도와 동일  (공시연도 = 기준연도)",
                        variable=self._pub_year_offset, value=0).pack(
            anchor="w", padx=12, pady=(8, 2))
        ttk.Radiobutton(frm_year, text="기준연도 + 1  (공시연도 = 기준연도 + 1)  ← 집계 시차 있는 항목",
                        variable=self._pub_year_offset, value=1).pack(
            anchor="w", padx=12, pady=(2, 8))

        # ── 실행 버튼 ──
        frm_btn = ttk.Frame(self)
        frm_btn.pack(fill="x", padx=12, pady=4)
        self._btn_run = ttk.Button(frm_btn, text="▶ 변환 및 JSON 저장",
                                   command=self._run, style="Accent.TButton")
        self._btn_run.pack(side="left")
        ttk.Label(frm_btn, text="  ← 실행 전 공시연도 방식을 반드시 확인하세요",
                  foreground="#888").pack(side="left")

        # ── 로그 ──
        frm_log = ttk.LabelFrame(self, text="처리 로그")
        frm_log.pack(fill="both", expand=True, **pad)

        self._log_text = tk.Text(frm_log, state="disabled", wrap="word",
                                 font=("Consolas", 9), background="#1e1e1e",
                                 foreground="#d4d4d4", relief="flat")
        scroll = ttk.Scrollbar(frm_log, command=self._log_text.yview)
        self._log_text.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        self._log_text.pack(fill="both", expand=True, padx=4, pady=4)

    # ── 파일 선택 ─────────────────────────────────────

    def _pick_file(self):
        path = filedialog.askopenfilename(
            title="xlsx 파일 선택",
            filetypes=[("Excel 파일", "*.xlsx *.xls"), ("모든 파일", "*.*")]
        )
        if not path:
            return
        self._file_var.set(path)
        # 항목 키 자동 입력
        auto_key = item_key_from_filename(Path(path).name)
        self._key_var.set(auto_key)
        self._log(f"파일 선택: {Path(path).name}")
        self._log(f"항목 키 자동 입력: {auto_key}")

    # ── 실행 ─────────────────────────────────────────

    def _run(self):
        filepath = self._file_var.get().strip()
        item_key = self._key_var.get().strip()
        offset   = self._pub_year_offset.get()

        if not filepath:
            messagebox.showwarning("입력 필요", "파일을 선택하세요.")
            return
        if not item_key:
            messagebox.showwarning("입력 필요", "항목 키를 입력하세요.")
            return

        self._btn_run.config(state="disabled")
        self._item_key = item_key
        threading.Thread(target=self._process,
                         args=(filepath, item_key, offset),
                         daemon=True).start()

    def _process(self, filepath: str, item_key: str, offset: int):
        try:
            self._log(f"\n{'─'*50}")
            self._log(f"📂 파일 로드 중: {Path(filepath).name}")

            # 1. xlsx → df
            df, sheet_name, header_rows, data_start = extract_df(filepath)
            self._log(f"   시트: {sheet_name}  |  헤더행: {header_rows}  |  데이터 시작: {data_start}행")
            self._log(f"   원시 컬럼({len(df.columns)}개): {list(df.columns)}")
            self._log(f"   원시 행 수: {len(df):,}행")

            # 2. 반기 정규화
            df = normalize_half_year(df)

            # 3. 필드 매핑
            mapping    = load_mapping()
            raw_headers = list(df.columns)
            resolved, new_fields = resolve_fields(raw_headers, mapping, item_key)

            if new_fields:
                self._log(f"\n⚠️  미등록 필드 {len(new_fields)}개 → 팝업 확인 필요")
                # 메인 스레드에서 팝업 실행
                decisions = self._ask_field_mapping(new_fields, mapping, item_key,
                                                    raw_headers, filepath)
                if decisions is None:
                    self._log("❌ 취소됨")
                    return

                # 팝업 결과 반영
                for raw_h, decision in decisions.items():
                    idx = raw_headers.index(raw_h)
                    if decision[0] == "map":
                        resolved[idx] = decision[1]
                        # alias 등록
                        sec = mapping.setdefault(item_key, {})
                        sec.setdefault(decision[1], [])
                        if raw_h not in sec[decision[1]]:
                            sec[decision[1]].append(raw_h)
                    elif decision[0] == "add":
                        mapping.setdefault(item_key, {}).setdefault(raw_h, [])
                    # ignore: resolved 그대로
                save_mapping(mapping)
                self._log("✅ 필드 매핑 저장 완료")

            df.columns = resolved

            # 4. 학교 필드 파싱
            df = parse_학교_field(df)

            # 5. 공시연도 삽입 (두 번째 컬럼) — 기준연도 + offset 으로 행마다 계산
            rule_label = "기준연도와 동일" if offset == 0 else f"기준연도 + {offset}"
            if '기준연도' not in df.columns:
                raise ValueError("기준연도 컬럼이 없어 공시연도를 계산할 수 없습니다.")
            pub_year_series = pd.to_numeric(df['기준연도'], errors='coerce') + offset
            if '공시연도' not in df.columns:
                df.insert(1, '공시연도', pub_year_series.astype('Int64'))
            else:
                df['공시연도'] = pub_year_series.astype('Int64')
            self._log(f"\n📅 공시연도 계산 방식: {rule_label}")

            # 6. 문자열 공백 제거
            for col in df.select_dtypes(include="object").columns:
                df[col] = df[col].apply(lambda v: v.strip() if isinstance(v, str) else v)

            # 7. 수치형 변환
            NON_NUMERIC = {"기준연도", "공시연도", "학교", "학교명", "대학명",
                           "본분교", "캠퍼스", "학과 (모집단위)", "학과명",
                           "지역", "설립구분", "대학구분", "계열"}
            for col in df.select_dtypes(include="object").columns:
                if col in NON_NUMERIC:
                    continue
                converted = pd.to_numeric(df[col], errors="coerce")
                if converted.notna().sum() > 0:
                    if converted.notna().sum() == df[col].notna().sum():
                        df[col] = converted

            # 8. 검증
            warnings = validate_df(df)
            if warnings:
                self._log("\n⚠️  검증 경고:")
                for w in warnings:
                    self._log(f"   • {w}")

            self._log(f"\n📋 최종 컬럼: {list(df.columns)}")

            # 9. JSON 누적
            기준연도_목록 = sorted(pd.to_numeric(df['기준연도'], errors='coerce').dropna().unique().astype(int)) if '기준연도' in df.columns else []
            공시연도_목록 = sorted(pd.to_numeric(df['공시연도'], errors='coerce').dropna().unique().astype(int)) if '공시연도' in df.columns else []
            self._log(f"   기준연도 목록: {기준연도_목록}")
            self._log(f"   공시연도 목록: {공시연도_목록}")
            self._log(f"   레코드: {len(df):,}행")

            new_cnt, total_cnt = accumulate_json(item_key, df)
            self._log(f"\n✅ JSON 저장 완료  — 신규 {new_cnt:,}행 / 누계 {total_cnt:,}행")
            self._log(f"   → data/{item_key}.json")

        except Exception as e:
            import traceback
            self._log(f"\n❌ 오류: {e}")
            self._log(traceback.format_exc())
        finally:
            self.after(0, lambda: self._btn_run.config(state="normal"))

    def _ask_field_mapping(self, new_fields, mapping, item_key, raw_headers, filepath):
        """메인 스레드에서 FieldMappingDialog를 열고 결과를 반환."""
        result_holder = [None]
        event = threading.Event()

        def open_dialog():
            shared = mapping.get("__shared", {})
            item_sec = mapping.get(item_key, {})
            existing_std = sorted(set(list(shared.keys()) + list(item_sec.keys())))

            dlg = FieldMappingDialog(self, new_fields, existing_std,
                                     Path(filepath).name, raw_headers)
            self.wait_window(dlg)
            if dlg.result == "ok":
                result_holder[0] = dlg.decisions
            event.set()

        self.after(0, open_dialog)
        event.wait()
        return result_holder[0]

    # ── 로그 헬퍼 ────────────────────────────────────

    def _log(self, msg: str):
        def _append():
            self._log_text.configure(state="normal")
            self._log_text.insert("end", msg + "\n")
            self._log_text.see("end")
            self._log_text.configure(state="disabled")
        self.after(0, _append)


# ─────────────────────────────────────────────────────

if __name__ == "__main__":
    app = App()
    app.mainloop()
