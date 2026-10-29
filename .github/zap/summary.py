"""Prints the ZAP alerts and fails on those at or above a risk (Medium by default).

  summary.py <report.json> [medium|high]

Accepted alerts are set to IGNORE (with a reason) in rules.tsv, so they never reach here.
"""

import json
import sys

RISK = {"0": "Info", "1": "Low", "2": "Medium", "3": "High"}
THRESHOLD = {"medium": 2, "high": 3}

with open(sys.argv[1], encoding="utf-8") as report:
    data = json.load(report)
fail_at = THRESHOLD[sys.argv[2] if len(sys.argv) > 2 else "medium"]

blocking = 0
for site in data.get("site", []):
    for alert in site.get("alerts", []):
        risk = str(alert.get("riskcode", "0"))
        urls = sorted({i.get("uri", "") for i in alert.get("instances", [])})
        print(f"[{RISK.get(risk, risk)}] {alert.get('pluginid')} {alert.get('name')} ({len(urls)} URLs)")
        for url in urls[:5]:
            print(f"    {url}")
        if int(risk) >= fail_at:
            blocking += 1

print(f"\n{blocking} alert(s) at {RISK[str(fail_at)]} risk or above.")
sys.exit(1 if blocking else 0)
