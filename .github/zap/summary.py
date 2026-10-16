"""Prints the ZAP baseline alerts and fails on Medium or High risk ones.

Accepted alerts are set to IGNORE (with a reason) in rules.tsv, so they never reach here.
"""

import json
import sys

RISK = {"0": "Info", "1": "Low", "2": "Medium", "3": "High"}

with open(sys.argv[1], encoding="utf-8") as report:
    data = json.load(report)

blocking = 0
for site in data.get("site", []):
    for alert in site.get("alerts", []):
        risk = str(alert.get("riskcode", "0"))
        urls = sorted({i.get("uri", "") for i in alert.get("instances", [])})
        print(f"[{RISK.get(risk, risk)}] {alert.get('pluginid')} {alert.get('name')} ({len(urls)} URLs)")
        for url in urls[:5]:
            print(f"    {url}")
        if int(risk) >= 2:
            blocking += 1

print(f"\n{blocking} Medium/High alert(s).")
sys.exit(1 if blocking else 0)
