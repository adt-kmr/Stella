# Formal Test Suite — End-Semester Project File (Section 5)

This directory contains the executable versions of test cases **T_01 – T_06**
from the STELLA project file. Each module carries the exact *Designed by*,
*Executed by*, dates, pre-conditions and step-by-step description from
Section 5.2; every step is its own pytest test so the execution counts match
Section 5.3 exactly.

| Test case | Module | Designed by | Executed by | Date | Steps |
|---|---|---|---|---|---|
| T_01 Receive and Store Satellite Telemetry | `test_T01_receive_store_telemetry.py` | Ashish Kumar | Pankhil Gupta | 07 Nov 2026 | 4 |
| T_02 Handle Missing or Corrupted Telemetry | `test_T02_corrupted_telemetry.py` | Ashish Kumar | Hitanshi Antil | 07 Nov 2026 | 4 |
| T_03 Nowcast Flare Activity (Conv1D) | `test_T03_nowcast.py` | Aditya Kumar | Pankhil Gupta | 08 Nov 2026 | 4 |
| T_04 Forecast Severity and Lead Time (TCN) | `test_T04_forecast.py` | Aditya Kumar | Hitanshi Antil | 08 Nov 2026 | 4 |
| T_05 Generate and Display Flare Warning | `test_T05_alert_warning.py` | Hitanshi Antil | Aditya Kumar | 09 Nov 2026 | 5 |
| T_06 Review Historical Flare Events | `test_T06_history_replay.py` | Pankhil Gupta | Ashish Kumar | 10 Nov 2026 | 4 |

All cases were designed on **28 Oct 2026**.

## 5.3 Test Execution Report

| Test Case | Subsystem | Executed By | Date | Steps | Passed | Failed | Status |
|---|---|---|---|---|---|---|---|
| T_01 | Data Ingestion | Pankhil Gupta | 07 Nov 2026 | 4 | 4 | 0 | PASS |
| T_02 | Data Ingestion | Hitanshi Antil | 07 Nov 2026 | 4 | 4 | 0 | PASS |
| T_03 | Nowcast Model | Pankhil Gupta | 08 Nov 2026 | 4 | 4 | 0 | PASS |
| T_04 | Forecast Model | Hitanshi Antil | 08 Nov 2026 | 4 | 4 | 0 | PASS |
| T_05 | Alert Engine | Aditya Kumar | 09 Nov 2026 | 5 | 5 | 0 | PASS |
| T_06 | History / Database | Ashish Kumar | 10 Nov 2026 | 4 | 4 | 0 | PASS |

**Summary:** 25 test steps executed across 6 test cases. 25 passed, 0 failed.
FR-1.1 – FR-3.3 and FR-5.1 – FR-5.2 are covered directly by T_01 – T_06.
FR-3.4, FR-4.1, FR-4.2, FR-5.3 and FR-6.1 remain future test work.

## 5.4 Peer Test Report

| Tester Group | Date | Test Cases Run | Defects Raised | Severity | Resolution |
|---|---|---|---|---|---|
| Peer Group A (3 members) | 11–12 Nov 2026 | T_01, T_02, T_05 | 1 | Minor — hard/soft (Neupert) ratio showed spurious quiet-Sun spikes from low-count HEL1OS noise | Mitigated 13 Nov 2026 with MAD-based z-score stabilisation; re-tested and closed |
| Peer Group B (2 members) | 12–13 Nov 2026 | T_03, T_04, T_06 | 0 | — | — |

Both groups confirmed ingestion, model inference and history features work
correctly. No functional or data-integrity issues were found during peer
testing.

## Running

```bash
python -m pytest tests/formal/ -v
```

The whole suite (existing contract/unit tests plus these six cases) is run with:

```bash
python -m pytest tests/ -v
```
