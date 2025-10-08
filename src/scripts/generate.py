import csv
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../../.env'))

BASE_URL = os.getenv("BASE_URL")
SESSION = requests.Session()
EMAIL = os.getenv("APP_EMAIL")
PASSWORD = os.getenv("APP_PASSWORD")

def login():
    url = f"{BASE_URL}/account/login"

    # GET login page to grab CSRF and JSESSION
    get_login_resp = SESSION.get(url)
    if get_login_resp.status_code != 200:
        raise Exception("❌ Login page request failed. Response:", get_login_resp.text)

    # Extract CSRF token
    match = re.search(r'name="_csrf"\s+[^>]*value="([^"]+)"', get_login_resp.text)
    if not match:
        raise Exception("❌ CSRF token not found")
    csrf_token = match.group(1)

    payload = {
        "email": EMAIL,
        "password": PASSWORD,
        "remember": "on",
        "_csrf": csrf_token,
    }

    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    return SESSION.post(url, headers=headers, data=payload)

def get_whatap_data(start_date=None, end_date=None):
    url = f"{BASE_URL}/yard/api/flush"
    headers = {"Content-Type": "application/json"}

    WIB = timezone(timedelta(hours=7))  # UTC+7

    if start_date and end_date:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(hour=8, minute=31, second=0, microsecond=0, tzinfo=WIB)
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=8, minute=30, second=0, microsecond=0, tzinfo=WIB)
    else:
        start_dt = datetime.now(WIB).replace(hour=8, minute=31, second=0, microsecond=0) - timedelta(days=1)
        end_dt = datetime.now(WIB).replace(hour=8, minute=30, second=0, microsecond=0)

    stime = int(start_dt.timestamp() * 1000)
    etime = int(end_dt.timestamp() * 1000)

    data = {
        "type": "stat",
        "path": "ap",
        "pcode": 10,
        "params": {
            "stime": stime,
            "etime": etime,
            "ptotal": 100,
            "skip": 0,
            "psize": 1000,
            "filter": {},
            "order": "count",
            "type": "error",
            "textLength": 0,
            "oids": []
        }
    }

    resp = SESSION.post(url, headers=headers, data=json.dumps(data))
    if resp.status_code != 200:
        raise Exception(f"Fetch WhaTap data failed: {resp.status_code}")
    return resp.json()


def export_csv(data):
    records = data.get("records", [])

    excluded_classes = [
        "com.tifscore.biz.exception.OneQLoanException",
        "com.tifscore.biz.exception.OneQPinException",
        "com.tifscore.biz.exception.OneQRequiredException",
        "com.tifscore.core.exception.OneQApiException",
        "com.tifscore.core.exception.OneQApprovalException",
        "com.tifscore.core.exception.OneQBizException",
        "com.tifscore.core.exception.OneQDBException",
        "com.tifscore.core.exception.OneQRsltException",
        "com.tifscore.core.exception.OneQLinkTranException",
        "com.tifscore.core.exception.OneQNormalRsltException",
        "com.tifscore.core.exception.OneQOnCoreException",
        "com.tifscore.core.exception.OneQOutBoundException",
        "com.tifscore.core.exception.OneQParamException",
        "com.tifscore.core.exception.OneQPinException",
        "com.tifscore.core.exception.OneQRequiredException",
        "com.tifscore.core.exception.OneQSimulationException",
        "com.tifscore.core.exception.OneQSystemException",
        "com.tifscore.exception.OneQAccountException",
        "com.tifscore.exception.OneQCardException",
        "com.tifscore.exception.OneQChannelException",
        "com.tifscore.exception.OneQCustomerException",
        "com.tifscore.exception.OneQDepositException",
        "com.tifscore.exception.OneQFactoryException",
        "com.tifscore.exception.OneQInvestmentException",
        "java.io.FIleNotFoundException",
        "SLOW_HTTPC",
    ]

    csv_data = [
        {
            "class": r.get("class", ""),
            "service": r.get("service", ""),
            "msg": r.get("msg", ""),
            "count": r.get("count", 0)
        }
        for r in records if r.get("class") not in excluded_classes
    ]

    # Ensure reports folder exists
    reports_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'src', 'reports')
    os.makedirs(reports_dir, exist_ok=True)

    # Generate a filename based on the date range
    if start_date and end_date:
        filename = f"{start_date}_to_{end_date}_Error_Monitoring_WhaTap.csv"
    else:
        today_str = datetime.now().strftime("%Y-%m-%d")
        filename = f"{today_str}_Error_Monitoring_WhaTap.csv"

    full_path = os.path.join(reports_dir, filename)

    with open(full_path, mode="w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=["class", "service", "msg", "count"])
        writer.writeheader()
        writer.writerows(csv_data)

    print(f"✅ Exported to: {full_path}", file=sys.stderr)
    print(json.dumps({"fullPath": full_path, "filename": filename}))

def process():
    try:
        if not BASE_URL or not EMAIL or not PASSWORD:
            raise Exception("Missing BASE_URL, APP_EMAIL, or APP_PASSWORD in .env")

        start_date = sys.argv[1] if len(sys.argv) > 1 else None
        end_date = sys.argv[2] if len(sys.argv) > 2 else None

        login_resp = login()
        if login_resp.status_code not in [200, 301]:
            raise Exception(f"Login failed: {login_resp.status_code}")

        whatap_resp = get_whatap_data(start_date, end_date)
        export_csv(whatap_resp)
        sys.exit(0)

    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    process()


