import csv
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("BASE_URL")
SESSION = requests.Session()
EMAIL = os.getenv("APP_EMAIL")
PASSWORD = os.getenv("APP_PASSWORD")


def login():
    url = f"{BASE_URL}/accounts/login"

    # GET login page to grab CSRF and JSESSION
    get_login_resp = SESSION.get(url)
    if get_login_resp.status_code != requests.codes.ok:
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


def get_whatap_data():
    url = f"{BASE_URL}/yard/api/flush"
    headers = {"Content-Type": "application/json"}

    WIB = timezone(timedelta(hours=7))  # UTC+7
    yesterday_0831 = datetime.now(WIB).replace(hour=8, minute=31, second=0, microsecond=0) - timedelta(days=1)
    today_0830 = datetime.now(WIB).replace(hour=8, minute=30, second=0, microsecond=0)

    stime = int(yesterday_0831.timestamp() * 1000)
    etime = int(today_0830.timestamp() * 1000)

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
            "olds": []
        }
    }

    return SESSION.post(url, headers=headers, data=json.dumps(data))


def export_csv(data):
    json_data = data.json()
    records = json_data.get("records", [])

    excluded_classes = [
        "com.tifscore.biz.exception.OneQLoanException",
        "com.tifscore.biz.exception.OneQPinException",
        "com.tifscore.biz.exception.OneQRequiredException",
        "com.tifscore.core.exception.OneQOnCoreException",
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

    csv_data = []
    for record in records:
        if record.get("class") not in excluded_classes:
            csv_data.append({
                "class": record.get("class", ""),
                "service": record.get("service", ""),
                "msg": record.get("msg", ""),
                "count": record.get("count", 0)
            })

    # Save CSV in the current project folder
    today_str = datetime.now().strftime("%d %B")
    filename = f"{today_str} Error Monitoring WhaTap.csv"
    full_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)

    with open(full_path, mode="w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=["class", "service", "msg", "count"])
        writer.writeheader()
        writer.writerows(csv_data)

    print(f"✅ Exported to: {full_path}")
    return full_path, filename


def process():
    try:
        if not BASE_URL or not EMAIL or not PASSWORD:
            print("❌ Missing BASE_URL, APP_EMAIL, or APP_PASSWORD in .env")
            sys.exit(1)

        login_resp = login()
        if login_resp.status_code not in [200, 301]:
            print("❌ Login failed. Status code:", login_resp.status_code)
            sys.exit(1)

        whatap_resp = get_whatap_data()
        if whatap_resp.status_code != 200:
            print("❌ Get WhaTap data failed. Status code:", whatap_resp.status_code)
            sys.exit(1)

        csvpath, csvname = export_csv(whatap_resp)
        sys.exit(0)

    except Exception as e:
        print("❌ Error:", e)
        sys.exit(1)


if __name__ == "__main__":
    process()


