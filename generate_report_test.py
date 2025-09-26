import csv
import os
from datetime import datetime

def generate_empty_csv():
    # Get today's date for filename
    today_str = datetime.now().strftime("%d %B")
    filename = f"{today_str} Error Monitoring WhaTap.csv"
    
    # Save in the current project folder
    full_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)

    # Create an empty CSV with headers
    headers = ["class", "service", "msg", "count"]
    with open(full_path, mode="w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=headers)
        writer.writeheader()  

    print(f"✅ Empty CSV generated: {full_path}")
    return full_path

if __name__ == "__main__":
    generate_empty_csv()


