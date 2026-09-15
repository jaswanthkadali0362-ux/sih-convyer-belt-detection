#!/usr/bin/env python3
"""
SAST findings collector for the security-audit Antigravity skill.
Executes Semgrep or Bandit and outputs a normalized JSON report to stdout.
"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional


def check_binary(name: str) -> bool:
    return shutil.which(name) is not None


def run_command(cmd: List[str]) -> Optional[str]:
    """Runs scanner command, ignoring non-zero exits triggered by finding discoveries."""
    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
        return proc.stdout
    except Exception as exc:
        sys.stderr.write(f"[!] Error executing {' '.join(cmd)}: {exc}\n")
        return None


def run_semgrep(target_path: str, config: str = "auto") -> List[Dict[str, Any]]:
    if not check_binary("semgrep"):
        sys.stderr.write("[!] Semgrep is not installed or not in PATH.\n")
        return []

    cmd = ["semgrep", "scan", "--config", config, "--json", "-q", target_path]
    raw_output = run_command(cmd)
    if not raw_output:
        return []

    findings = []
    try:
        data = json.loads(raw_output)
        for item in data.get("results", []):
            extra = item.get("extra", {})
            metadata = extra.get("metadata", {})
            
            cwe_data = metadata.get("cwe", [])
            cwe = cwe_data[0] if isinstance(cwe_data, list) and cwe_data else "CWE-Unknown"

            severity_map = {
                "ERROR": "HIGH",
                "WARNING": "MEDIUM",
                "INFO": "LOW"
            }

            findings.append({
                "source_engine": "semgrep",
                "check_id": item.get("check_id"),
                "cwe": cwe,
                "severity": severity_map.get(extra.get("severity", "INFO"), "LOW"),
                "file": item.get("path"),
                "line_start": item.get("start", {}).get("line"),
                "line_end": item.get("end", {}).get("line"),
                "message": extra.get("message", "").strip(),
                "snippet": extra.get("lines", "").strip()
            })
    except json.JSONDecodeError:
        sys.stderr.write("[!] Failed to decode Semgrep JSON output.\n")

    return findings


def run_bandit(target_path: str) -> List[Dict[str, Any]]:
    if not check_binary("bandit"):
        sys.stderr.write("[!] Bandit is not installed or not in PATH.\n")
        return []

    cmd = ["bandit", "-r", target_path, "-f", "json", "-q"]
    raw_output = run_command(cmd)
    if not raw_output:
        return []

    findings = []
    try:
        data = json.loads(raw_output)
        for item in data.get("results", []):
            cwe_id = item.get("issue_cwe", {}).get("id")
            cwe = f"CWE-{cwe_id}" if cwe_id else "CWE-Unknown"

            findings.append({
                "source_engine": "bandit",
                "check_id": item.get("test_id"),
                "cwe": cwe,
                "severity": item.get("issue_severity", "LOW").upper(),
                "file": item.get("filename"),
                "line_start": item.get("line_number"),
                "line_end": max(item.get("line_range", [item.get("line_number", 0)])),
                "message": item.get("issue_text", "").strip(),
                "snippet": item.get("code", "").strip()
            })
    except json.JSONDecodeError:
        sys.stderr.write("[!] Failed to decode Bandit JSON output.\n")

    return findings


def main():
    parser = argparse.ArgumentParser(description="Unified SAST runner for security-audit agent skill.")
    parser.add_argument("target", nargs="?", default=".", help="Target file or directory to scan.")
    parser.add_argument(
        "--engine",
        choices=["auto", "semgrep", "bandit", "all"],
        default="auto",
        help="Scanner engine to invoke (default: auto)",
    )
    parser.add_argument(
        "--semgrep-config",
        default="auto",
        help="Semgrep ruleset config (e.g., 'auto', 'p/ci', 'p/owasp-top-ten')",
    )

    args = parser.parse_args()
    target = str(Path(args.target).resolve())
    collected_findings: List[Dict[str, Any]] = []

    if args.engine == "semgrep":
        collected_findings = run_semgrep(target, args.semgrep_config)
    elif args.engine == "bandit":
        collected_findings = run_bandit(target)
    elif args.engine == "all":
        collected_findings.extend(run_semgrep(target, args.semgrep_config))
        collected_findings.extend(run_bandit(target))
    else:  # auto
        if check_binary("semgrep"):
            collected_findings = run_semgrep(target, args.semgrep_config)
        elif check_binary("bandit"):
            collected_findings = run_bandit(target)
        else:
            sys.stderr.write("[!] Neither semgrep nor bandit was found in environment PATH.\n")
            sys.exit(1)

    # Sort findings by severity priority
    priority = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    collected_findings.sort(key=lambda x: priority.get(x["severity"], 4))

    report = {
        "status": "success",
        "target": target,
        "total_findings": len(collected_findings),
        "findings": collected_findings
    }

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
