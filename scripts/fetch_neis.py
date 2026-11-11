#!/usr/bin/env python3
"""Fetch this week's school meals and high-school timetable from NEIS."""

import json
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen
from zoneinfo import ZoneInfo

API_ROOT = "https://open.neis.go.kr/hub"
SCHOOL_NAME = "합덕제철고등학교"
PAGE_SIZE = 1000
SEOUL = ZoneInfo("Asia/Seoul")
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "data" / "neis.json"


def fetch_rows(api_key, service, parameters):
    rows = []
    seen_rows = set()
    total_count = None
    page = 1
    while True:
        query = urlencode({
            "KEY": api_key,
            "Type": "json",
            "pIndex": page,
            "pSize": PAGE_SIZE,
            **parameters,
        })
        request_url = f"{API_ROOT}/{service}?{query}"
        try:
            with urlopen(request_url, timeout=30) as response:
                payload = json.load(response)
        except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as error:
            status = getattr(error, "code", "network")
            raise RuntimeError(f"NEIS {service} request failed ({status}).") from None

        blocks = payload.get(service)
        if not blocks:
            result = payload.get("RESULT", {})
            if result.get("CODE") == "INFO-200":
                break
            code = result.get("CODE", "unknown")
            raise RuntimeError(f"NEIS {service} returned an error ({code}).")

        page_rows = []
        for block in blocks:
            if isinstance(block, dict):
                page_rows.extend(block.get("row", []))

                for header in block.get("head", []):
                    if "list_total_count" in header:
                        total_count = int(header["list_total_count"])

        if not page_rows:
            if total_count is not None and len(seen_rows) < total_count:
                raise RuntimeError(
                    f"NEIS {service} returned {len(seen_rows)} of {total_count} records."
                )
            break

        new_rows = []
        for row in page_rows:
            row_id = json.dumps(row, sort_keys=True, ensure_ascii=False)
            if row_id not in seen_rows:
                seen_rows.add(row_id)
                new_rows.append(row)
        if not new_rows:
            raise RuntimeError(f"NEIS {service} pagination did not advance; refusing incomplete data.")
        rows.extend(new_rows)

        if total_count is None:
            if len(page_rows) < PAGE_SIZE:
                break
        elif len(seen_rows) >= total_count:
            break

        page += 1
        if page > 100:
            raise RuntimeError(f"NEIS {service} returned more than 100 pages.")
    return rows


def get_school(api_key):
    rows = fetch_rows(api_key, "schoolInfo", {"SCHUL_NM": SCHOOL_NAME})
    exact_matches = [row for row in rows if row.get("SCHUL_NM") == SCHOOL_NAME]
    if len(exact_matches) != 1:
        raise RuntimeError(f"Expected one exact NEIS match for {SCHOOL_NAME}; found {len(exact_matches)}.")
    return exact_matches[0]


def weekday_dates(today):
    monday = today - timedelta(days=today.weekday())
    return monday, [monday + timedelta(days=offset) for offset in range(5)]


def build_payload(api_key):
    school = get_school(api_key)
    office_code = school.get("ATPT_OFCDC_SC_CODE")
    school_code = school.get("SD_SCHUL_CODE")
    if not office_code or not school_code:
        raise RuntimeError("The NEIS school lookup did not include required school codes.")

    monday, dates = weekday_dates(datetime.now(SEOUL).date())
    meals = []
    timetable = []
    for date in dates:
        date_code = date.strftime("%Y%m%d")
        school_params = {
            "ATPT_OFCDC_SC_CODE": office_code,
            "SD_SCHUL_CODE": school_code,
        }

        for row in fetch_rows(api_key, "mealServiceDietInfo", {
            **school_params,
            "MLSV_YMD": date_code,
        }):
            meals.append({
                "date": date.isoformat(),
                "mealType": row.get("MMEAL_SC_NM", ""),
                "menu": row.get("DDISH_NM", ""),
                "calorie": row.get("CAL_INFO", ""),
            })

        for row in fetch_rows(api_key, "hisTimetable", {
            **school_params,
            "AY": str(date.year if date.month >= 3 else date.year - 1),
            "SEM": "1" if 3 <= date.month <= 7 else "2",
            "ALL_TI_YMD": date_code,
        }):
            timetable.append({
                "date": date.isoformat(),
                "grade": row.get("GRADE", ""),
                "classNumber": row.get("CLASS_NM", ""),
                "period": row.get("PERIO", ""),
                "subject": row.get("ITRT_CNTNT", ""),
                "room": row.get("CLRM_NM", ""),
            })
        time.sleep(0.1)

    meals.sort(key=lambda row: (row["date"], row["mealType"]))
    timetable.sort(key=lambda row: (
        str(row.get("grade") or ""),
        str(row.get("classNumber") or ""),
        str(row.get("date") or ""),
        int(row["period"]) if str(row["period"]).isdigit() else 0,
    ))
    return {
        "school": {
            "name": SCHOOL_NAME,
            "officeCode": office_code,
            "schoolCode": school_code,
        },
        "generatedAt": datetime.now(SEOUL).isoformat(timespec="seconds"),
        "weekStart": monday.isoformat(),
        "weekEnd": dates[-1].isoformat(),
        "meals": meals,
        "timetable": timetable,
    }


def main():
    api_key = os.environ.get("NEIS_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("NEIS_API_KEY is not set in the workflow environment.")
    payload = build_payload(api_key)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"NEIS data generated for {payload['weekStart']} to {payload['weekEnd']}: "
        f"{len(payload['meals'])} meal entries and {len(payload['timetable'])} timetable entries."
    )


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
