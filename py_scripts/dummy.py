import csv
import os
import sys
import json
from datetime import datetime

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))

BASE_URL = os.getenv('BASE_URL')
EMAIL = os.getenv('APP_EMAIL')
PASSWORD = os.getenv('APP_PASSWORD')

def generate_dummy_data():
    records = [
        {"class": "com.tifscore.biz.exception.OneQLoanException", "service": "LoanService", "msg": "Loan failed", "count": 5},
        {"class": "com.tifscore.core.exception.OneQOnCoreException", "service": "CoreService", "msg": "Core error", "count": 2},
        {"class": "com.tifscore.custom.DummyException", "service": "DummyService", "msg": "Something went wrong", "count": 10},
        {"class": "SLOW_HTTPC", "service": "NetworkService", "msg": "HTTP timeout", "count": 3},
        {"class": "com.tifscore.custom.AnotherDummyException", "service": "OtherService", "msg": "Other error", "count": 1},
    ]

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

    return [r for r in records if r["class"] not in excluded_classes]

def export_csv(records):
    today_str = datetime.now().strftime("%d %B")
    filename = f"{today_str} Error Monitoring WhaTap.csv"

    # Ensure reports folder exists
    reports_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'src', 'reports')
    os.makedirs(reports_dir, exist_ok=True)

    full_path = os.path.join(reports_dir, filename)

    with open(full_path, mode="w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=["class", "service", "msg", "count"])
        writer.writeheader()
        writer.writerows(records)

    print(f"✅ Dummy CSV exported to: {full_path}", file=sys.stderr)
    print(json.dumps({"fullPath": full_path, "filename": filename}))

def process():
    try:
        records = generate_dummy_data()
        if not records:
            print("⚠️ No records to export", file=sys.stderr)
            sys.exit(0)

        export_csv(records)
        sys.exit(0)
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    process()

