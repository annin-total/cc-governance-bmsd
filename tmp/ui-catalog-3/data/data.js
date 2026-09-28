window.DATA = {
 "meta": {
  "today": "2026-09-29",
  "today_epoch_day": 20725,
  "csv_last": "2026-09-28",
  "csv_last_epoch_day": 20724,
  "csv_first": "2025-08-26",
  "server_commit": "9b7d9ae",
  "source": "scripts/seed_dashboard.py --users 40 --days 400 の合成データ（CSV あり）",
  "generated_at": "2026-09-29T08:11:55+09:00",
  "notes": [
   "日付は JST。*_epoch_day と window の値は epoch 日（整数）",
   "記録（events）由来の期間は today で終わり、CSV 由来（cost・csv_users）は CSV の最終日で終わる",
   "periods.N は reports.overview / reports.assets を集計期間 N 日で呼んだ結果（サーバの今の定義のまま）",
   "率は 0–100 の百分率。分母 0 なら null"
  ],
  "sensitive_check": {
   "emails": 40,
   "non_example_emails": [],
   "hosts": 44,
   "unexpected_hosts": [],
   "ok": true
  }
 },
 "daily_cost": [
  {
   "day": 20326,
   "date": "2025-08-26",
   "providers": {
    "aws-bedrock": 103.14,
    "google-vertex": 10.22
   },
   "users": 6,
   "total": 113.36
  },
  {
   "day": 20327,
   "date": "2025-08-27",
   "providers": {
    "aws-bedrock": 85.08
   },
   "users": 6,
   "total": 85.08
  },
  {
   "day": 20328,
   "date": "2025-08-28",
   "providers": {
    "aws-bedrock": 116.7,
    "google-vertex": 9.85
   },
   "users": 9,
   "total": 126.55
  },
  {
   "day": 20329,
   "date": "2025-08-29",
   "providers": {
    "aws-bedrock": 89.53,
    "google-vertex": 18.84
   },
   "users": 8,
   "total": 108.37
  },
  {
   "day": 20330,
   "date": "2025-08-30",
   "providers": {
    "aws-bedrock": 53.66
   },
   "users": 3,
   "total": 53.66
  },
  {
   "day": 20331,
   "date": "2025-08-31",
   "providers": {
    "aws-bedrock": 110.46,
    "google-vertex": 1.57
   },
   "users": 8,
   "total": 112.03
  },
  {
   "day": 20332,
   "date": "2025-09-01",
   "providers": {
    "aws-bedrock": 58.23,
    "google-vertex": 28.74
   },
   "users": 8,
   "total": 86.97
  },
  {
   "day": 20333,
   "date": "2025-09-02",
   "providers": {
    "aws-bedrock": 93.27,
    "google-vertex": 27.7
   },
   "users": 9,
   "total": 120.97
  },
  {
   "day": 20334,
   "date": "2025-09-03",
   "providers": {
    "aws-bedrock": 74.22,
    "google-vertex": 18.26
   },
   "users": 9,
   "total": 92.48
  },
  {
   "day": 20335,
   "date": "2025-09-04",
   "providers": {
    "aws-bedrock": 105.69,
    "google-vertex": 7.7
   },
   "users": 8,
   "total": 113.39
  },
  {
   "day": 20336,
   "date": "2025-09-05",
   "providers": {
    "aws-bedrock": 49.17,
    "google-vertex": 17.3
   },
   "users": 7,
   "total": 66.47
  },
  {
   "day": 20337,
   "date": "2025-09-06",
   "providers": {
    "aws-bedrock": 70.25,
    "google-vertex": 22.87
   },
   "users": 7,
   "total": 93.12
  },
  {
   "day": 20338,
   "date": "2025-09-07",
   "providers": {
    "aws-bedrock": 64.81,
    "google-vertex": 59.47
   },
   "users": 9,
   "total": 124.28
  },
  {
   "day": 20339,
   "date": "2025-09-08",
   "providers": {
    "aws-bedrock": 71.51,
    "google-vertex": 12.56
   },
   "users": 8,
   "total": 84.07
  },
  {
   "day": 20340,
   "date": "2025-09-09",
   "providers": {
    "aws-bedrock": 78.94,
    "google-vertex": 5.11
   },
   "users": 6,
   "total": 84.05
  },
  {
   "day": 20341,
   "date": "2025-09-10",
   "providers": {
    "aws-bedrock": 56.42,
    "google-vertex": 62.51
   },
   "users": 7,
   "total": 118.93
  },
  {
   "day": 20342,
   "date": "2025-09-11",
   "providers": {
    "aws-bedrock": 61.98,
    "google-vertex": 26.76
   },
   "users": 9,
   "total": 88.74
  },
  {
   "day": 20343,
   "date": "2025-09-12",
   "providers": {
    "aws-bedrock": 143.66
   },
   "users": 10,
   "total": 143.66
  },
  {
   "day": 20344,
   "date": "2025-09-13",
   "providers": {
    "aws-bedrock": 64.89
   },
   "users": 9,
   "total": 64.89
  },
  {
   "day": 20345,
   "date": "2025-09-14",
   "providers": {
    "aws-bedrock": 68.29,
    "google-vertex": 5.78
   },
   "users": 6,
   "total": 74.07
  },
  {
   "day": 20346,
   "date": "2025-09-15",
   "providers": {
    "aws-bedrock": 99.55
   },
   "users": 6,
   "total": 99.55
  },
  {
   "day": 20347,
   "date": "2025-09-16",
   "providers": {
    "aws-bedrock": 68.12,
    "google-vertex": 17.38
   },
   "users": 7,
   "total": 85.5
  },
  {
   "day": 20348,
   "date": "2025-09-17",
   "providers": {
    "aws-bedrock": 53.77
   },
   "users": 8,
   "total": 53.77
  },
  {
   "day": 20349,
   "date": "2025-09-18",
   "providers": {
    "aws-bedrock": 69.49
   },
   "users": 8,
   "total": 69.49
  },
  {
   "day": 20350,
   "date": "2025-09-19",
   "providers": {
    "aws-bedrock": 91.75
   },
   "users": 8,
   "total": 91.75
  },
  {
   "day": 20351,
   "date": "2025-09-20",
   "providers": {
    "aws-bedrock": 68.38,
    "google-vertex": 19.3
   },
   "users": 6,
   "total": 87.68
  },
  {
   "day": 20352,
   "date": "2025-09-21",
   "providers": {
    "aws-bedrock": 36.9,
    "google-vertex": 20.48
   },
   "users": 7,
   "total": 57.38
  },
  {
   "day": 20353,
   "date": "2025-09-22",
   "providers": {
    "aws-bedrock": 88.0,
    "google-vertex": 21.94
   },
   "users": 9,
   "total": 109.94
  },
  {
   "day": 20354,
   "date": "2025-09-23",
   "providers": {
    "aws-bedrock": 95.58,
    "google-vertex": 34.74
   },
   "users": 9,
   "total": 130.32
  },
  {
   "day": 20355,
   "date": "2025-09-24",
   "providers": {
    "aws-bedrock": 89.79,
    "google-vertex": 10.06
   },
   "users": 8,
   "total": 99.85
  },
  {
   "day": 20356,
   "date": "2025-09-25",
   "providers": {
    "aws-bedrock": 79.24
   },
   "users": 9,
   "total": 79.24
  },
  {
   "day": 20357,
   "date": "2025-09-26",
   "providers": {
    "aws-bedrock": 24.28,
    "google-vertex": 70.38
   },
   "users": 8,
   "total": 94.66
  },
  {
   "day": 20358,
   "date": "2025-09-27",
   "providers": {
    "aws-bedrock": 81.04,
    "google-vertex": 4.82
   },
   "users": 8,
   "total": 85.86
  },
  {
   "day": 20359,
   "date": "2025-09-28",
   "providers": {
    "aws-bedrock": 76.65,
    "google-vertex": 18.42
   },
   "users": 7,
   "total": 95.07
  },
  {
   "day": 20360,
   "date": "2025-09-29",
   "providers": {
    "aws-bedrock": 38.12,
    "google-vertex": 23.73
   },
   "users": 8,
   "total": 61.85
  },
  {
   "day": 20361,
   "date": "2025-09-30",
   "providers": {
    "aws-bedrock": 86.18,
    "google-vertex": 26.57
   },
   "users": 9,
   "total": 112.75
  },
  {
   "day": 20362,
   "date": "2025-10-01",
   "providers": {
    "aws-bedrock": 118.67,
    "google-vertex": 26.38
   },
   "users": 11,
   "total": 145.05
  },
  {
   "day": 20363,
   "date": "2025-10-02",
   "providers": {
    "aws-bedrock": 108.81,
    "google-vertex": 68.44
   },
   "users": 12,
   "total": 177.25
  },
  {
   "day": 20364,
   "date": "2025-10-03",
   "providers": {
    "aws-bedrock": 146.61,
    "google-vertex": 13.03
   },
   "users": 12,
   "total": 159.64
  },
  {
   "day": 20365,
   "date": "2025-10-04",
   "providers": {
    "aws-bedrock": 47.78,
    "google-vertex": 40.8
   },
   "users": 8,
   "total": 88.58
  },
  {
   "day": 20366,
   "date": "2025-10-05",
   "providers": {
    "aws-bedrock": 116.6,
    "google-vertex": 25.83
   },
   "users": 11,
   "total": 142.43
  },
  {
   "day": 20367,
   "date": "2025-10-06",
   "providers": {
    "aws-bedrock": 118.08,
    "google-vertex": 21.53
   },
   "users": 12,
   "total": 139.61
  },
  {
   "day": 20368,
   "date": "2025-10-07",
   "providers": {
    "aws-bedrock": 89.34,
    "google-vertex": 47.27
   },
   "users": 10,
   "total": 136.61
  },
  {
   "day": 20369,
   "date": "2025-10-08",
   "providers": {
    "aws-bedrock": 61.02,
    "google-vertex": 38.97
   },
   "users": 10,
   "total": 99.99
  },
  {
   "day": 20370,
   "date": "2025-10-09",
   "providers": {
    "aws-bedrock": 70.42,
    "google-vertex": 46.28
   },
   "users": 10,
   "total": 116.7
  },
  {
   "day": 20371,
   "date": "2025-10-10",
   "providers": {
    "aws-bedrock": 96.38,
    "google-vertex": 14.67
   },
   "users": 10,
   "total": 111.05
  },
  {
   "day": 20372,
   "date": "2025-10-11",
   "providers": {
    "aws-bedrock": 65.91,
    "google-vertex": 36.86
   },
   "users": 9,
   "total": 102.77
  },
  {
   "day": 20373,
   "date": "2025-10-12",
   "providers": {
    "aws-bedrock": 67.39,
    "google-vertex": 65.0
   },
   "users": 8,
   "total": 132.39
  },
  {
   "day": 20374,
   "date": "2025-10-13",
   "providers": {
    "aws-bedrock": 117.5,
    "google-vertex": 29.22
   },
   "users": 11,
   "total": 146.72
  },
  {
   "day": 20375,
   "date": "2025-10-14",
   "providers": {
    "aws-bedrock": 97.85,
    "google-vertex": 51.29
   },
   "users": 11,
   "total": 149.14
  },
  {
   "day": 20376,
   "date": "2025-10-15",
   "providers": {
    "aws-bedrock": 94.4,
    "google-vertex": 21.2
   },
   "users": 7,
   "total": 115.6
  },
  {
   "day": 20377,
   "date": "2025-10-16",
   "providers": {
    "aws-bedrock": 102.99,
    "google-vertex": 30.73
   },
   "users": 11,
   "total": 133.72
  },
  {
   "day": 20378,
   "date": "2025-10-17",
   "providers": {
    "aws-bedrock": 87.43,
    "google-vertex": 49.7
   },
   "users": 11,
   "total": 137.13
  },
  {
   "day": 20379,
   "date": "2025-10-18",
   "providers": {
    "aws-bedrock": 118.14
   },
   "users": 11,
   "total": 118.14
  },
  {
   "day": 20380,
   "date": "2025-10-19",
   "providers": {
    "aws-bedrock": 82.68,
    "google-vertex": 39.44
   },
   "users": 10,
   "total": 122.12
  },
  {
   "day": 20381,
   "date": "2025-10-20",
   "providers": {
    "aws-bedrock": 94.8,
    "google-vertex": 15.78
   },
   "users": 10,
   "total": 110.58
  },
  {
   "day": 20382,
   "date": "2025-10-21",
   "providers": {
    "aws-bedrock": 69.73,
    "google-vertex": 43.6
   },
   "users": 12,
   "total": 113.33
  },
  {
   "day": 20383,
   "date": "2025-10-22",
   "providers": {
    "aws-bedrock": 80.04,
    "google-vertex": 14.29
   },
   "users": 8,
   "total": 94.33
  },
  {
   "day": 20384,
   "date": "2025-10-23",
   "providers": {
    "aws-bedrock": 71.68,
    "google-vertex": 25.48
   },
   "users": 12,
   "total": 97.16
  },
  {
   "day": 20385,
   "date": "2025-10-24",
   "providers": {
    "aws-bedrock": 108.47,
    "google-vertex": 19.33
   },
   "users": 11,
   "total": 127.8
  },
  {
   "day": 20386,
   "date": "2025-10-25",
   "providers": {
    "aws-bedrock": 70.67,
    "google-vertex": 29.8
   },
   "users": 9,
   "total": 100.47
  },
  {
   "day": 20387,
   "date": "2025-10-26",
   "providers": {
    "aws-bedrock": 88.81,
    "google-vertex": 18.46
   },
   "users": 8,
   "total": 107.27
  },
  {
   "day": 20388,
   "date": "2025-10-27",
   "providers": {
    "aws-bedrock": 110.43
   },
   "users": 8,
   "total": 110.43
  },
  {
   "day": 20389,
   "date": "2025-10-28",
   "providers": {
    "aws-bedrock": 124.19
   },
   "users": 12,
   "total": 124.19
  },
  {
   "day": 20390,
   "date": "2025-10-29",
   "providers": {
    "aws-bedrock": 78.48,
    "google-vertex": 50.08
   },
   "users": 10,
   "total": 128.56
  },
  {
   "day": 20391,
   "date": "2025-10-30",
   "providers": {
    "aws-bedrock": 81.36,
    "google-vertex": 37.09
   },
   "users": 12,
   "total": 118.45
  },
  {
   "day": 20392,
   "date": "2025-10-31",
   "providers": {
    "aws-bedrock": 127.47,
    "google-vertex": 10.3
   },
   "users": 10,
   "total": 137.77
  },
  {
   "day": 20393,
   "date": "2025-11-01",
   "providers": {
    "aws-bedrock": 131.58,
    "google-vertex": 48.72
   },
   "users": 13,
   "total": 180.3
  },
  {
   "day": 20394,
   "date": "2025-11-02",
   "providers": {
    "aws-bedrock": 55.51,
    "google-vertex": 32.44
   },
   "users": 10,
   "total": 87.95
  },
  {
   "day": 20395,
   "date": "2025-11-03",
   "providers": {
    "aws-bedrock": 60.21,
    "google-vertex": 33.74
   },
   "users": 11,
   "total": 93.95
  },
  {
   "day": 20396,
   "date": "2025-11-04",
   "providers": {
    "aws-bedrock": 146.08,
    "google-vertex": 11.86
   },
   "users": 12,
   "total": 157.94
  },
  {
   "day": 20397,
   "date": "2025-11-05",
   "providers": {
    "aws-bedrock": 97.3,
    "google-vertex": 24.0
   },
   "users": 11,
   "total": 121.3
  },
  {
   "day": 20398,
   "date": "2025-11-06",
   "providers": {
    "aws-bedrock": 113.1,
    "google-vertex": 21.62
   },
   "users": 11,
   "total": 134.72
  },
  {
   "day": 20399,
   "date": "2025-11-07",
   "providers": {
    "aws-bedrock": 109.17,
    "google-vertex": 14.51
   },
   "users": 10,
   "total": 123.68
  },
  {
   "day": 20400,
   "date": "2025-11-08",
   "providers": {
    "aws-bedrock": 136.85,
    "google-vertex": 24.55
   },
   "users": 13,
   "total": 161.4
  },
  {
   "day": 20401,
   "date": "2025-11-09",
   "providers": {
    "aws-bedrock": 114.99,
    "google-vertex": 28.71
   },
   "users": 13,
   "total": 143.7
  },
  {
   "day": 20402,
   "date": "2025-11-10",
   "providers": {
    "aws-bedrock": 82.45,
    "google-vertex": 49.95
   },
   "users": 13,
   "total": 132.4
  },
  {
   "day": 20403,
   "date": "2025-11-11",
   "providers": {
    "aws-bedrock": 118.34,
    "google-vertex": 13.63
   },
   "users": 11,
   "total": 131.97
  },
  {
   "day": 20404,
   "date": "2025-11-12",
   "providers": {
    "aws-bedrock": 147.44,
    "google-vertex": 14.86
   },
   "users": 14,
   "total": 162.3
  },
  {
   "day": 20405,
   "date": "2025-11-13",
   "providers": {
    "aws-bedrock": 134.27,
    "google-vertex": 43.96
   },
   "users": 13,
   "total": 178.23
  },
  {
   "day": 20406,
   "date": "2025-11-14",
   "providers": {
    "aws-bedrock": 182.82
   },
   "users": 13,
   "total": 182.82
  },
  {
   "day": 20407,
   "date": "2025-11-15",
   "providers": {
    "aws-bedrock": 88.59,
    "google-vertex": 22.59
   },
   "users": 10,
   "total": 111.18
  },
  {
   "day": 20408,
   "date": "2025-11-16",
   "providers": {
    "aws-bedrock": 81.87,
    "google-vertex": 59.51
   },
   "users": 15,
   "total": 141.38
  },
  {
   "day": 20409,
   "date": "2025-11-17",
   "providers": {
    "aws-bedrock": 158.77,
    "google-vertex": 15.52
   },
   "users": 14,
   "total": 174.29
  },
  {
   "day": 20410,
   "date": "2025-11-18",
   "providers": {
    "aws-bedrock": 80.83,
    "google-vertex": 75.81
   },
   "users": 13,
   "total": 156.64
  },
  {
   "day": 20411,
   "date": "2025-11-19",
   "providers": {
    "aws-bedrock": 114.58,
    "google-vertex": 16.06
   },
   "users": 13,
   "total": 130.64
  },
  {
   "day": 20412,
   "date": "2025-11-20",
   "providers": {
    "aws-bedrock": 155.8,
    "google-vertex": 17.46
   },
   "users": 14,
   "total": 173.26
  },
  {
   "day": 20413,
   "date": "2025-11-21",
   "providers": {
    "aws-bedrock": 88.01,
    "google-vertex": 72.44
   },
   "users": 14,
   "total": 160.45
  },
  {
   "day": 20414,
   "date": "2025-11-22",
   "providers": {
    "aws-bedrock": 70.99,
    "google-vertex": 13.6
   },
   "users": 12,
   "total": 84.59
  },
  {
   "day": 20415,
   "date": "2025-11-23",
   "providers": {
    "aws-bedrock": 88.75,
    "google-vertex": 29.72
   },
   "users": 10,
   "total": 118.47
  },
  {
   "day": 20416,
   "date": "2025-11-24",
   "providers": {
    "aws-bedrock": 90.32,
    "google-vertex": 52.02
   },
   "users": 14,
   "total": 142.34
  },
  {
   "day": 20417,
   "date": "2025-11-25",
   "providers": {
    "aws-bedrock": 135.88,
    "google-vertex": 79.57
   },
   "users": 17,
   "total": 215.45
  },
  {
   "day": 20418,
   "date": "2025-11-26",
   "providers": {
    "aws-bedrock": 145.65,
    "google-vertex": 43.1
   },
   "users": 13,
   "total": 188.75
  },
  {
   "day": 20419,
   "date": "2025-11-27",
   "providers": {
    "aws-bedrock": 77.7,
    "google-vertex": 30.62
   },
   "users": 11,
   "total": 108.32
  },
  {
   "day": 20420,
   "date": "2025-11-28",
   "providers": {
    "aws-bedrock": 171.14,
    "google-vertex": 43.38
   },
   "users": 14,
   "total": 214.52
  },
  {
   "day": 20421,
   "date": "2025-11-29",
   "providers": {
    "aws-bedrock": 81.42,
    "google-vertex": 56.59
   },
   "users": 14,
   "total": 138.01
  },
  {
   "day": 20422,
   "date": "2025-11-30",
   "providers": {
    "aws-bedrock": 140.07,
    "google-vertex": 22.08
   },
   "users": 14,
   "total": 162.15
  },
  {
   "day": 20423,
   "date": "2025-12-01",
   "providers": {
    "aws-bedrock": 130.97,
    "google-vertex": 47.5
   },
   "users": 12,
   "total": 178.47
  },
  {
   "day": 20424,
   "date": "2025-12-02",
   "providers": {
    "aws-bedrock": 116.85,
    "google-vertex": 5.92
   },
   "users": 12,
   "total": 122.77
  },
  {
   "day": 20425,
   "date": "2025-12-03",
   "providers": {
    "aws-bedrock": 197.04,
    "google-vertex": 12.11
   },
   "users": 18,
   "total": 209.15
  },
  {
   "day": 20426,
   "date": "2025-12-04",
   "providers": {
    "aws-bedrock": 137.68,
    "google-vertex": 63.93
   },
   "users": 17,
   "total": 201.61
  },
  {
   "day": 20427,
   "date": "2025-12-05",
   "providers": {
    "aws-bedrock": 158.8,
    "google-vertex": 23.91
   },
   "users": 15,
   "total": 182.71
  },
  {
   "day": 20428,
   "date": "2025-12-06",
   "providers": {
    "aws-bedrock": 141.91,
    "google-vertex": 47.57
   },
   "users": 17,
   "total": 189.48
  },
  {
   "day": 20429,
   "date": "2025-12-07",
   "providers": {
    "aws-bedrock": 143.62,
    "google-vertex": 16.07
   },
   "users": 15,
   "total": 159.69
  },
  {
   "day": 20430,
   "date": "2025-12-08",
   "providers": {
    "aws-bedrock": 103.76,
    "google-vertex": 8.83
   },
   "users": 13,
   "total": 112.59
  },
  {
   "day": 20431,
   "date": "2025-12-09",
   "providers": {
    "aws-bedrock": 94.51,
    "google-vertex": 33.54
   },
   "users": 11,
   "total": 128.05
  },
  {
   "day": 20432,
   "date": "2025-12-10",
   "providers": {
    "aws-bedrock": 74.91,
    "google-vertex": 48.01
   },
   "users": 11,
   "total": 122.92
  },
  {
   "day": 20433,
   "date": "2025-12-11",
   "providers": {
    "aws-bedrock": 113.9,
    "google-vertex": 20.51
   },
   "users": 14,
   "total": 134.41
  },
  {
   "day": 20434,
   "date": "2025-12-12",
   "providers": {
    "aws-bedrock": 113.91,
    "google-vertex": 41.21
   },
   "users": 16,
   "total": 155.12
  },
  {
   "day": 20435,
   "date": "2025-12-13",
   "providers": {
    "aws-bedrock": 133.57,
    "google-vertex": 51.79
   },
   "users": 15,
   "total": 185.36
  },
  {
   "day": 20436,
   "date": "2025-12-14",
   "providers": {
    "aws-bedrock": 179.36,
    "google-vertex": 10.11
   },
   "users": 16,
   "total": 189.47
  },
  {
   "day": 20437,
   "date": "2025-12-15",
   "providers": {
    "aws-bedrock": 139.85,
    "google-vertex": 21.42
   },
   "users": 16,
   "total": 161.27
  },
  {
   "day": 20438,
   "date": "2025-12-16",
   "providers": {
    "aws-bedrock": 206.95
   },
   "users": 16,
   "total": 206.95
  },
  {
   "day": 20439,
   "date": "2025-12-17",
   "providers": {
    "aws-bedrock": 110.79,
    "google-vertex": 42.58
   },
   "users": 17,
   "total": 153.37
  },
  {
   "day": 20440,
   "date": "2025-12-18",
   "providers": {
    "aws-bedrock": 157.51,
    "google-vertex": 33.18
   },
   "users": 18,
   "total": 190.69
  },
  {
   "day": 20441,
   "date": "2025-12-19",
   "providers": {
    "aws-bedrock": 114.66,
    "google-vertex": 87.08
   },
   "users": 19,
   "total": 201.74
  },
  {
   "day": 20442,
   "date": "2025-12-20",
   "providers": {
    "aws-bedrock": 152.43,
    "google-vertex": 47.19
   },
   "users": 18,
   "total": 199.62
  },
  {
   "day": 20443,
   "date": "2025-12-21",
   "providers": {
    "aws-bedrock": 136.1,
    "google-vertex": 16.15
   },
   "users": 15,
   "total": 152.25
  },
  {
   "day": 20444,
   "date": "2025-12-22",
   "providers": {
    "aws-bedrock": 84.96,
    "google-vertex": 28.95
   },
   "users": 13,
   "total": 113.91
  },
  {
   "day": 20445,
   "date": "2025-12-23",
   "providers": {
    "aws-bedrock": 168.1,
    "google-vertex": 52.89
   },
   "users": 17,
   "total": 220.99
  },
  {
   "day": 20446,
   "date": "2025-12-24",
   "providers": {
    "aws-bedrock": 200.21,
    "google-vertex": 28.76
   },
   "users": 16,
   "total": 228.97
  },
  {
   "day": 20447,
   "date": "2025-12-25",
   "providers": {
    "aws-bedrock": 157.56,
    "google-vertex": 4.39
   },
   "users": 15,
   "total": 161.95
  },
  {
   "day": 20448,
   "date": "2025-12-26",
   "providers": {
    "aws-bedrock": 190.74,
    "google-vertex": 4.22
   },
   "users": 17,
   "total": 194.96
  },
  {
   "day": 20449,
   "date": "2025-12-27",
   "providers": {
    "aws-bedrock": 126.49,
    "google-vertex": 25.69
   },
   "users": 17,
   "total": 152.18
  },
  {
   "day": 20450,
   "date": "2025-12-28",
   "providers": {
    "aws-bedrock": 155.09,
    "google-vertex": 108.92
   },
   "users": 17,
   "total": 264.01
  },
  {
   "day": 20451,
   "date": "2025-12-29",
   "providers": {
    "aws-bedrock": 128.19,
    "google-vertex": 37.38
   },
   "users": 17,
   "total": 165.57
  },
  {
   "day": 20452,
   "date": "2025-12-30",
   "providers": {
    "aws-bedrock": 187.63,
    "google-vertex": 11.16
   },
   "users": 18,
   "total": 198.79
  },
  {
   "day": 20453,
   "date": "2025-12-31",
   "providers": {
    "aws-bedrock": 169.47,
    "google-vertex": 42.67
   },
   "users": 18,
   "total": 212.14
  },
  {
   "day": 20454,
   "date": "2026-01-01",
   "providers": {
    "aws-bedrock": 137.87,
    "google-vertex": 46.04
   },
   "users": 15,
   "total": 183.91
  },
  {
   "day": 20455,
   "date": "2026-01-02",
   "providers": {
    "aws-bedrock": 131.75,
    "google-vertex": 28.15
   },
   "users": 18,
   "total": 159.9
  },
  {
   "day": 20456,
   "date": "2026-01-03",
   "providers": {
    "aws-bedrock": 208.99,
    "google-vertex": 51.05
   },
   "users": 20,
   "total": 260.04
  },
  {
   "day": 20457,
   "date": "2026-01-04",
   "providers": {
    "aws-bedrock": 183.01,
    "google-vertex": 50.2
   },
   "users": 17,
   "total": 233.21
  },
  {
   "day": 20458,
   "date": "2026-01-05",
   "providers": {
    "aws-bedrock": 190.47,
    "google-vertex": 35.74
   },
   "users": 17,
   "total": 226.21
  },
  {
   "day": 20459,
   "date": "2026-01-06",
   "providers": {
    "aws-bedrock": 191.5,
    "google-vertex": 49.12
   },
   "users": 23,
   "total": 240.62
  },
  {
   "day": 20460,
   "date": "2026-01-07",
   "providers": {
    "aws-bedrock": 92.11,
    "google-vertex": 94.61
   },
   "users": 18,
   "total": 186.72
  },
  {
   "day": 20461,
   "date": "2026-01-08",
   "providers": {
    "aws-bedrock": 214.42,
    "google-vertex": 45.39
   },
   "users": 21,
   "total": 259.81
  },
  {
   "day": 20462,
   "date": "2026-01-09",
   "providers": {
    "aws-bedrock": 183.81
   },
   "users": 16,
   "total": 183.81
  },
  {
   "day": 20463,
   "date": "2026-01-10",
   "providers": {
    "aws-bedrock": 161.91,
    "google-vertex": 60.86
   },
   "users": 20,
   "total": 222.77
  },
  {
   "day": 20464,
   "date": "2026-01-11",
   "providers": {
    "aws-bedrock": 164.73,
    "google-vertex": 57.85
   },
   "users": 21,
   "total": 222.58
  },
  {
   "day": 20465,
   "date": "2026-01-12",
   "providers": {
    "aws-bedrock": 109.78,
    "google-vertex": 59.55
   },
   "users": 18,
   "total": 169.33
  },
  {
   "day": 20466,
   "date": "2026-01-13",
   "providers": {
    "aws-bedrock": 223.52
   },
   "users": 19,
   "total": 223.52
  },
  {
   "day": 20467,
   "date": "2026-01-14",
   "providers": {
    "aws-bedrock": 126.6,
    "google-vertex": 45.98
   },
   "users": 16,
   "total": 172.58
  },
  {
   "day": 20468,
   "date": "2026-01-15",
   "providers": {
    "aws-bedrock": 101.25,
    "google-vertex": 61.45
   },
   "users": 18,
   "total": 162.7
  },
  {
   "day": 20469,
   "date": "2026-01-16",
   "providers": {
    "aws-bedrock": 144.0,
    "google-vertex": 40.92
   },
   "users": 16,
   "total": 184.92
  },
  {
   "day": 20470,
   "date": "2026-01-17",
   "providers": {
    "aws-bedrock": 209.96,
    "google-vertex": 50.19
   },
   "users": 19,
   "total": 260.15
  },
  {
   "day": 20471,
   "date": "2026-01-18",
   "providers": {
    "aws-bedrock": 129.12,
    "google-vertex": 75.68
   },
   "users": 20,
   "total": 204.8
  },
  {
   "day": 20472,
   "date": "2026-01-19",
   "providers": {
    "aws-bedrock": 127.5,
    "google-vertex": 76.61
   },
   "users": 20,
   "total": 204.11
  },
  {
   "day": 20473,
   "date": "2026-01-20",
   "providers": {
    "aws-bedrock": 191.21,
    "google-vertex": 33.75
   },
   "users": 19,
   "total": 224.96
  },
  {
   "day": 20474,
   "date": "2026-01-21",
   "providers": {
    "aws-bedrock": 128.63,
    "google-vertex": 69.75
   },
   "users": 18,
   "total": 198.38
  },
  {
   "day": 20475,
   "date": "2026-01-22",
   "providers": {
    "aws-bedrock": 162.88,
    "google-vertex": 35.13
   },
   "users": 20,
   "total": 198.01
  },
  {
   "day": 20476,
   "date": "2026-01-23",
   "providers": {
    "aws-bedrock": 164.77,
    "google-vertex": 52.51
   },
   "users": 20,
   "total": 217.28
  },
  {
   "day": 20477,
   "date": "2026-01-24",
   "providers": {
    "aws-bedrock": 233.22,
    "google-vertex": 8.49
   },
   "users": 19,
   "total": 241.71
  },
  {
   "day": 20478,
   "date": "2026-01-25",
   "providers": {
    "aws-bedrock": 129.99,
    "google-vertex": 31.02
   },
   "users": 16,
   "total": 161.01
  },
  {
   "day": 20479,
   "date": "2026-01-26",
   "providers": {
    "aws-bedrock": 126.82,
    "google-vertex": 58.5
   },
   "users": 19,
   "total": 185.32
  },
  {
   "day": 20480,
   "date": "2026-01-27",
   "providers": {
    "aws-bedrock": 225.96,
    "google-vertex": 30.48
   },
   "users": 21,
   "total": 256.44
  },
  {
   "day": 20481,
   "date": "2026-01-28",
   "providers": {
    "aws-bedrock": 172.43,
    "google-vertex": 11.9
   },
   "users": 19,
   "total": 184.33
  },
  {
   "day": 20482,
   "date": "2026-01-29",
   "providers": {
    "aws-bedrock": 127.82,
    "google-vertex": 32.93
   },
   "users": 16,
   "total": 160.75
  },
  {
   "day": 20483,
   "date": "2026-01-30",
   "providers": {
    "aws-bedrock": 226.96,
    "google-vertex": 76.66
   },
   "users": 22,
   "total": 303.62
  },
  {
   "day": 20484,
   "date": "2026-01-31",
   "providers": {
    "aws-bedrock": 186.78,
    "google-vertex": 24.22
   },
   "users": 19,
   "total": 211.0
  },
  {
   "day": 20485,
   "date": "2026-02-01",
   "providers": {
    "aws-bedrock": 215.21,
    "google-vertex": 49.51
   },
   "users": 20,
   "total": 264.72
  },
  {
   "day": 20486,
   "date": "2026-02-02",
   "providers": {
    "aws-bedrock": 216.14,
    "google-vertex": 13.05
   },
   "users": 19,
   "total": 229.19
  },
  {
   "day": 20487,
   "date": "2026-02-03",
   "providers": {
    "aws-bedrock": 201.67,
    "google-vertex": 32.98
   },
   "users": 20,
   "total": 234.65
  },
  {
   "day": 20488,
   "date": "2026-02-04",
   "providers": {
    "aws-bedrock": 137.87,
    "google-vertex": 27.62
   },
   "users": 16,
   "total": 165.49
  },
  {
   "day": 20489,
   "date": "2026-02-05",
   "providers": {
    "aws-bedrock": 118.6,
    "google-vertex": 30.81
   },
   "users": 16,
   "total": 149.41
  },
  {
   "day": 20490,
   "date": "2026-02-06",
   "providers": {
    "aws-bedrock": 165.23,
    "google-vertex": 45.76
   },
   "users": 21,
   "total": 210.99
  },
  {
   "day": 20491,
   "date": "2026-02-07",
   "providers": {
    "aws-bedrock": 163.39,
    "google-vertex": 69.88
   },
   "users": 19,
   "total": 233.27
  },
  {
   "day": 20492,
   "date": "2026-02-08",
   "providers": {
    "aws-bedrock": 153.61,
    "google-vertex": 77.16
   },
   "users": 18,
   "total": 230.77
  },
  {
   "day": 20493,
   "date": "2026-02-09",
   "providers": {
    "aws-bedrock": 220.29,
    "google-vertex": 39.7
   },
   "users": 22,
   "total": 259.99
  },
  {
   "day": 20494,
   "date": "2026-02-10",
   "providers": {
    "aws-bedrock": 221.58,
    "google-vertex": 10.12
   },
   "users": 20,
   "total": 231.7
  },
  {
   "day": 20495,
   "date": "2026-02-11",
   "providers": {
    "aws-bedrock": 178.92,
    "google-vertex": 25.17
   },
   "users": 18,
   "total": 204.09
  },
  {
   "day": 20496,
   "date": "2026-02-12",
   "providers": {
    "aws-bedrock": 219.81,
    "google-vertex": 25.07
   },
   "users": 20,
   "total": 244.88
  },
  {
   "day": 20497,
   "date": "2026-02-13",
   "providers": {
    "aws-bedrock": 127.79,
    "google-vertex": 57.75
   },
   "users": 19,
   "total": 185.54
  },
  {
   "day": 20498,
   "date": "2026-02-14",
   "providers": {
    "aws-bedrock": 147.45,
    "google-vertex": 64.83
   },
   "users": 21,
   "total": 212.28
  },
  {
   "day": 20499,
   "date": "2026-02-15",
   "providers": {
    "aws-bedrock": 163.68,
    "google-vertex": 23.14
   },
   "users": 20,
   "total": 186.82
  },
  {
   "day": 20500,
   "date": "2026-02-16",
   "providers": {
    "aws-bedrock": 219.08,
    "google-vertex": 50.2
   },
   "users": 22,
   "total": 269.28
  },
  {
   "day": 20501,
   "date": "2026-02-17",
   "providers": {
    "aws-bedrock": 161.3,
    "google-vertex": 39.15
   },
   "users": 20,
   "total": 200.45
  },
  {
   "day": 20502,
   "date": "2026-02-18",
   "providers": {
    "aws-bedrock": 98.11,
    "google-vertex": 41.25
   },
   "users": 19,
   "total": 139.36
  },
  {
   "day": 20503,
   "date": "2026-02-19",
   "providers": {
    "aws-bedrock": 169.81,
    "google-vertex": 28.4
   },
   "users": 20,
   "total": 198.21
  },
  {
   "day": 20504,
   "date": "2026-02-20",
   "providers": {
    "aws-bedrock": 111.37,
    "google-vertex": 67.47
   },
   "users": 19,
   "total": 178.84
  },
  {
   "day": 20505,
   "date": "2026-02-21",
   "providers": {
    "aws-bedrock": 216.89,
    "google-vertex": 9.36
   },
   "users": 19,
   "total": 226.25
  },
  {
   "day": 20506,
   "date": "2026-02-22",
   "providers": {
    "aws-bedrock": 177.83,
    "google-vertex": 38.56
   },
   "users": 19,
   "total": 216.39
  },
  {
   "day": 20507,
   "date": "2026-02-23",
   "providers": {
    "aws-bedrock": 118.46,
    "google-vertex": 59.43
   },
   "users": 18,
   "total": 177.89
  },
  {
   "day": 20508,
   "date": "2026-02-24",
   "providers": {
    "aws-bedrock": 163.47,
    "google-vertex": 27.58
   },
   "users": 20,
   "total": 191.05
  },
  {
   "day": 20509,
   "date": "2026-02-25",
   "providers": {
    "aws-bedrock": 184.53,
    "google-vertex": 20.28
   },
   "users": 20,
   "total": 204.81
  },
  {
   "day": 20510,
   "date": "2026-02-26",
   "providers": {
    "aws-bedrock": 227.04,
    "google-vertex": 44.47
   },
   "users": 22,
   "total": 271.51
  },
  {
   "day": 20511,
   "date": "2026-02-27",
   "providers": {
    "aws-bedrock": 150.75,
    "google-vertex": 52.34
   },
   "users": 20,
   "total": 203.09
  },
  {
   "day": 20512,
   "date": "2026-02-28",
   "providers": {
    "aws-bedrock": 205.51,
    "google-vertex": 17.31
   },
   "users": 22,
   "total": 222.82
  },
  {
   "day": 20513,
   "date": "2026-03-01",
   "providers": {
    "aws-bedrock": 191.12,
    "google-vertex": 27.88
   },
   "users": 20,
   "total": 219.0
  },
  {
   "day": 20514,
   "date": "2026-03-02",
   "providers": {
    "aws-bedrock": 162.19,
    "google-vertex": 76.5
   },
   "users": 19,
   "total": 238.69
  },
  {
   "day": 20515,
   "date": "2026-03-03",
   "providers": {
    "aws-bedrock": 190.27
   },
   "users": 20,
   "total": 190.27
  },
  {
   "day": 20516,
   "date": "2026-03-04",
   "providers": {
    "aws-bedrock": 165.74,
    "google-vertex": 9.05
   },
   "users": 20,
   "total": 174.79
  },
  {
   "day": 20517,
   "date": "2026-03-05",
   "providers": {
    "aws-bedrock": 265.73,
    "google-vertex": 46.59
   },
   "users": 22,
   "total": 312.32
  },
  {
   "day": 20518,
   "date": "2026-03-06",
   "providers": {
    "aws-bedrock": 191.67,
    "google-vertex": 25.38
   },
   "users": 21,
   "total": 217.05
  },
  {
   "day": 20519,
   "date": "2026-03-07",
   "providers": {
    "aws-bedrock": 169.71,
    "google-vertex": 48.71
   },
   "users": 21,
   "total": 218.42
  },
  {
   "day": 20520,
   "date": "2026-03-08",
   "providers": {
    "aws-bedrock": 242.32,
    "google-vertex": 29.11
   },
   "users": 23,
   "total": 271.43
  },
  {
   "day": 20521,
   "date": "2026-03-09",
   "providers": {
    "aws-bedrock": 184.88,
    "google-vertex": 15.86
   },
   "users": 17,
   "total": 200.74
  },
  {
   "day": 20522,
   "date": "2026-03-10",
   "providers": {
    "aws-bedrock": 195.4,
    "google-vertex": 24.59
   },
   "users": 21,
   "total": 219.99
  },
  {
   "day": 20523,
   "date": "2026-03-11",
   "providers": {
    "aws-bedrock": 206.45,
    "google-vertex": 63.12
   },
   "users": 22,
   "total": 269.57
  },
  {
   "day": 20524,
   "date": "2026-03-12",
   "providers": {
    "aws-bedrock": 169.0,
    "google-vertex": 34.86
   },
   "users": 18,
   "total": 203.86
  },
  {
   "day": 20525,
   "date": "2026-03-13",
   "providers": {
    "aws-bedrock": 179.06,
    "google-vertex": 42.72
   },
   "users": 20,
   "total": 221.78
  },
  {
   "day": 20526,
   "date": "2026-03-14",
   "providers": {
    "aws-bedrock": 177.21,
    "google-vertex": 42.79
   },
   "users": 20,
   "total": 220.0
  },
  {
   "day": 20527,
   "date": "2026-03-15",
   "providers": {
    "aws-bedrock": 205.92,
    "google-vertex": 18.28
   },
   "users": 21,
   "total": 224.2
  },
  {
   "day": 20528,
   "date": "2026-03-16",
   "providers": {
    "aws-bedrock": 226.01,
    "google-vertex": 16.51
   },
   "users": 20,
   "total": 242.52
  },
  {
   "day": 20529,
   "date": "2026-03-17",
   "providers": {
    "aws-bedrock": 211.23,
    "google-vertex": 32.6
   },
   "users": 20,
   "total": 243.83
  },
  {
   "day": 20530,
   "date": "2026-03-18",
   "providers": {
    "aws-bedrock": 222.49,
    "google-vertex": 54.18
   },
   "users": 22,
   "total": 276.67
  },
  {
   "day": 20531,
   "date": "2026-03-19",
   "providers": {
    "aws-bedrock": 176.12,
    "google-vertex": 27.42
   },
   "users": 21,
   "total": 203.54
  },
  {
   "day": 20532,
   "date": "2026-03-20",
   "providers": {
    "aws-bedrock": 145.92,
    "google-vertex": 45.24
   },
   "users": 18,
   "total": 191.16
  },
  {
   "day": 20533,
   "date": "2026-03-21",
   "providers": {
    "aws-bedrock": 205.71,
    "google-vertex": 34.0
   },
   "users": 18,
   "total": 239.71
  },
  {
   "day": 20534,
   "date": "2026-03-22",
   "providers": {
    "aws-bedrock": 181.35,
    "google-vertex": 43.82
   },
   "users": 18,
   "total": 225.17
  },
  {
   "day": 20535,
   "date": "2026-03-23",
   "providers": {
    "aws-bedrock": 175.95,
    "google-vertex": 47.95
   },
   "users": 20,
   "total": 223.9
  },
  {
   "day": 20536,
   "date": "2026-03-24",
   "providers": {
    "aws-bedrock": 151.18,
    "google-vertex": 56.72
   },
   "users": 22,
   "total": 207.9
  },
  {
   "day": 20537,
   "date": "2026-03-25",
   "providers": {
    "aws-bedrock": 227.77,
    "google-vertex": 11.9
   },
   "users": 20,
   "total": 239.67
  },
  {
   "day": 20538,
   "date": "2026-03-26",
   "providers": {
    "aws-bedrock": 151.04,
    "google-vertex": 5.56
   },
   "users": 19,
   "total": 156.6
  },
  {
   "day": 20539,
   "date": "2026-03-27",
   "providers": {
    "aws-bedrock": 178.23,
    "google-vertex": 55.67
   },
   "users": 19,
   "total": 233.9
  },
  {
   "day": 20540,
   "date": "2026-03-28",
   "providers": {
    "aws-bedrock": 160.04,
    "google-vertex": 54.75
   },
   "users": 18,
   "total": 214.79
  },
  {
   "day": 20541,
   "date": "2026-03-29",
   "providers": {
    "aws-bedrock": 237.34,
    "google-vertex": 83.43
   },
   "users": 24,
   "total": 320.77
  },
  {
   "day": 20542,
   "date": "2026-03-30",
   "providers": {
    "aws-bedrock": 240.66,
    "google-vertex": 7.7
   },
   "users": 20,
   "total": 248.36
  },
  {
   "day": 20543,
   "date": "2026-03-31",
   "providers": {
    "aws-bedrock": 198.42,
    "google-vertex": 31.78
   },
   "users": 20,
   "total": 230.2
  },
  {
   "day": 20544,
   "date": "2026-04-01",
   "providers": {
    "aws-bedrock": 153.63,
    "google-vertex": 32.68
   },
   "users": 18,
   "total": 186.31
  },
  {
   "day": 20545,
   "date": "2026-04-02",
   "providers": {
    "aws-bedrock": 219.58,
    "google-vertex": 23.56
   },
   "users": 22,
   "total": 243.14
  },
  {
   "day": 20546,
   "date": "2026-04-03",
   "providers": {
    "aws-bedrock": 207.62,
    "google-vertex": 46.56
   },
   "users": 21,
   "total": 254.18
  },
  {
   "day": 20547,
   "date": "2026-04-04",
   "providers": {
    "aws-bedrock": 157.64,
    "google-vertex": 72.77
   },
   "users": 19,
   "total": 230.41
  },
  {
   "day": 20548,
   "date": "2026-04-05",
   "providers": {
    "aws-bedrock": 209.19,
    "google-vertex": 20.14
   },
   "users": 19,
   "total": 229.33
  },
  {
   "day": 20549,
   "date": "2026-04-06",
   "providers": {
    "aws-bedrock": 175.71,
    "google-vertex": 43.58
   },
   "users": 22,
   "total": 219.29
  },
  {
   "day": 20550,
   "date": "2026-04-07",
   "providers": {
    "aws-bedrock": 110.09,
    "google-vertex": 124.96
   },
   "users": 17,
   "total": 235.05
  },
  {
   "day": 20551,
   "date": "2026-04-08",
   "providers": {
    "aws-bedrock": 232.37,
    "google-vertex": 35.69
   },
   "users": 22,
   "total": 268.06
  },
  {
   "day": 20552,
   "date": "2026-04-09",
   "providers": {
    "aws-bedrock": 165.84,
    "google-vertex": 40.33
   },
   "users": 18,
   "total": 206.17
  },
  {
   "day": 20553,
   "date": "2026-04-10",
   "providers": {
    "aws-bedrock": 127.52,
    "google-vertex": 69.97
   },
   "users": 19,
   "total": 197.49
  },
  {
   "day": 20554,
   "date": "2026-04-11",
   "providers": {
    "aws-bedrock": 170.53,
    "google-vertex": 28.76
   },
   "users": 22,
   "total": 199.29
  },
  {
   "day": 20555,
   "date": "2026-04-12",
   "providers": {
    "aws-bedrock": 210.34,
    "google-vertex": 52.58
   },
   "users": 23,
   "total": 262.92
  },
  {
   "day": 20556,
   "date": "2026-04-13",
   "providers": {
    "aws-bedrock": 215.83,
    "google-vertex": 51.54
   },
   "users": 21,
   "total": 267.37
  },
  {
   "day": 20557,
   "date": "2026-04-14",
   "providers": {
    "aws-bedrock": 138.79,
    "google-vertex": 54.32
   },
   "users": 18,
   "total": 193.11
  },
  {
   "day": 20558,
   "date": "2026-04-15",
   "providers": {
    "aws-bedrock": 189.79,
    "google-vertex": 50.73
   },
   "users": 21,
   "total": 240.52
  },
  {
   "day": 20559,
   "date": "2026-04-16",
   "providers": {
    "aws-bedrock": 220.08,
    "google-vertex": 38.84
   },
   "users": 23,
   "total": 258.92
  },
  {
   "day": 20560,
   "date": "2026-04-17",
   "providers": {
    "aws-bedrock": 241.08,
    "google-vertex": 41.61
   },
   "users": 24,
   "total": 282.69
  },
  {
   "day": 20561,
   "date": "2026-04-18",
   "providers": {
    "aws-bedrock": 244.51,
    "google-vertex": 32.76
   },
   "users": 24,
   "total": 277.27
  },
  {
   "day": 20562,
   "date": "2026-04-19",
   "providers": {
    "aws-bedrock": 180.92,
    "google-vertex": 11.63
   },
   "users": 20,
   "total": 192.55
  },
  {
   "day": 20563,
   "date": "2026-04-20",
   "providers": {
    "aws-bedrock": 172.19,
    "google-vertex": 84.79
   },
   "users": 22,
   "total": 256.98
  },
  {
   "day": 20564,
   "date": "2026-04-21",
   "providers": {
    "aws-bedrock": 178.85,
    "google-vertex": 59.19
   },
   "users": 22,
   "total": 238.04
  },
  {
   "day": 20565,
   "date": "2026-04-22",
   "providers": {
    "aws-bedrock": 245.97,
    "google-vertex": 46.75
   },
   "users": 23,
   "total": 292.72
  },
  {
   "day": 20566,
   "date": "2026-04-23",
   "providers": {
    "aws-bedrock": 286.73,
    "google-vertex": 17.31
   },
   "users": 22,
   "total": 304.04
  },
  {
   "day": 20567,
   "date": "2026-04-24",
   "providers": {
    "aws-bedrock": 197.61,
    "google-vertex": 52.21
   },
   "users": 24,
   "total": 249.82
  },
  {
   "day": 20568,
   "date": "2026-04-25",
   "providers": {
    "aws-bedrock": 163.5,
    "google-vertex": 71.71
   },
   "users": 22,
   "total": 235.21
  },
  {
   "day": 20569,
   "date": "2026-04-26",
   "providers": {
    "aws-bedrock": 197.41,
    "google-vertex": 20.52
   },
   "users": 20,
   "total": 217.93
  },
  {
   "day": 20570,
   "date": "2026-04-27",
   "providers": {
    "aws-bedrock": 237.31,
    "google-vertex": 23.82
   },
   "users": 25,
   "total": 261.13
  },
  {
   "day": 20571,
   "date": "2026-04-28",
   "providers": {
    "aws-bedrock": 100.14,
    "google-vertex": 96.59
   },
   "users": 20,
   "total": 196.73
  },
  {
   "day": 20572,
   "date": "2026-04-29",
   "providers": {
    "aws-bedrock": 217.75,
    "google-vertex": 5.46
   },
   "users": 23,
   "total": 223.21
  },
  {
   "day": 20573,
   "date": "2026-04-30",
   "providers": {
    "aws-bedrock": 256.44,
    "google-vertex": 50.55
   },
   "users": 26,
   "total": 306.99
  },
  {
   "day": 20574,
   "date": "2026-05-01",
   "providers": {
    "aws-bedrock": 161.3,
    "google-vertex": 43.25
   },
   "users": 21,
   "total": 204.55
  },
  {
   "day": 20575,
   "date": "2026-05-02",
   "providers": {
    "aws-bedrock": 188.12,
    "google-vertex": 54.24
   },
   "users": 25,
   "total": 242.36
  },
  {
   "day": 20576,
   "date": "2026-05-03",
   "providers": {
    "aws-bedrock": 194.06,
    "google-vertex": 61.65
   },
   "users": 18,
   "total": 255.71
  },
  {
   "day": 20577,
   "date": "2026-05-04",
   "providers": {
    "aws-bedrock": 238.59,
    "google-vertex": 46.85
   },
   "users": 25,
   "total": 285.44
  },
  {
   "day": 20578,
   "date": "2026-05-05",
   "providers": {
    "aws-bedrock": 196.86,
    "google-vertex": 33.42
   },
   "users": 22,
   "total": 230.28
  },
  {
   "day": 20579,
   "date": "2026-05-06",
   "providers": {
    "aws-bedrock": 194.55,
    "google-vertex": 28.47
   },
   "users": 21,
   "total": 223.02
  },
  {
   "day": 20580,
   "date": "2026-05-07",
   "providers": {
    "aws-bedrock": 227.19,
    "google-vertex": 39.11
   },
   "users": 22,
   "total": 266.3
  },
  {
   "day": 20581,
   "date": "2026-05-08",
   "providers": {
    "aws-bedrock": 155.62,
    "google-vertex": 88.06
   },
   "users": 25,
   "total": 243.68
  },
  {
   "day": 20582,
   "date": "2026-05-09",
   "providers": {
    "aws-bedrock": 200.99,
    "google-vertex": 72.88
   },
   "users": 23,
   "total": 273.87
  },
  {
   "day": 20583,
   "date": "2026-05-10",
   "providers": {
    "aws-bedrock": 236.32,
    "google-vertex": 27.84
   },
   "users": 21,
   "total": 264.16
  },
  {
   "day": 20584,
   "date": "2026-05-11",
   "providers": {
    "aws-bedrock": 265.19,
    "google-vertex": 29.13
   },
   "users": 22,
   "total": 294.32
  },
  {
   "day": 20585,
   "date": "2026-05-12",
   "providers": {
    "aws-bedrock": 175.27,
    "google-vertex": 80.45
   },
   "users": 22,
   "total": 255.72
  },
  {
   "day": 20586,
   "date": "2026-05-13",
   "providers": {
    "aws-bedrock": 149.45,
    "google-vertex": 74.48
   },
   "users": 22,
   "total": 223.93
  },
  {
   "day": 20587,
   "date": "2026-05-14",
   "providers": {
    "aws-bedrock": 217.21,
    "google-vertex": 53.95
   },
   "users": 20,
   "total": 271.16
  },
  {
   "day": 20588,
   "date": "2026-05-15",
   "providers": {
    "aws-bedrock": 185.73,
    "google-vertex": 64.18
   },
   "users": 22,
   "total": 249.91
  },
  {
   "day": 20589,
   "date": "2026-05-16",
   "providers": {
    "aws-bedrock": 279.38,
    "google-vertex": 54.43
   },
   "users": 26,
   "total": 333.81
  },
  {
   "day": 20590,
   "date": "2026-05-17",
   "providers": {
    "aws-bedrock": 185.79,
    "google-vertex": 3.17
   },
   "users": 20,
   "total": 188.96
  },
  {
   "day": 20591,
   "date": "2026-05-18",
   "providers": {
    "aws-bedrock": 219.62,
    "google-vertex": 66.11
   },
   "users": 25,
   "total": 285.73
  },
  {
   "day": 20592,
   "date": "2026-05-19",
   "providers": {
    "aws-bedrock": 170.24,
    "google-vertex": 41.95
   },
   "users": 21,
   "total": 212.19
  },
  {
   "day": 20593,
   "date": "2026-05-20",
   "providers": {
    "aws-bedrock": 198.74,
    "google-vertex": 55.65
   },
   "users": 23,
   "total": 254.39
  },
  {
   "day": 20594,
   "date": "2026-05-21",
   "providers": {
    "aws-bedrock": 151.99,
    "google-vertex": 41.61
   },
   "users": 20,
   "total": 193.6
  },
  {
   "day": 20595,
   "date": "2026-05-22",
   "providers": {
    "aws-bedrock": 243.95,
    "google-vertex": 21.27
   },
   "users": 24,
   "total": 265.22
  },
  {
   "day": 20596,
   "date": "2026-05-23",
   "providers": {
    "aws-bedrock": 237.61,
    "google-vertex": 75.07
   },
   "users": 26,
   "total": 312.68
  },
  {
   "day": 20597,
   "date": "2026-05-24",
   "providers": {
    "aws-bedrock": 285.15,
    "google-vertex": 55.87
   },
   "users": 26,
   "total": 341.02
  },
  {
   "day": 20598,
   "date": "2026-05-25",
   "providers": {
    "aws-bedrock": 299.67,
    "google-vertex": 44.47
   },
   "users": 27,
   "total": 344.14
  },
  {
   "day": 20599,
   "date": "2026-05-26",
   "providers": {
    "aws-bedrock": 235.84,
    "google-vertex": 83.7
   },
   "users": 24,
   "total": 319.54
  },
  {
   "day": 20600,
   "date": "2026-05-27",
   "providers": {
    "aws-bedrock": 211.59,
    "google-vertex": 47.89
   },
   "users": 23,
   "total": 259.48
  },
  {
   "day": 20601,
   "date": "2026-05-28",
   "providers": {
    "aws-bedrock": 185.53,
    "google-vertex": 7.06
   },
   "users": 22,
   "total": 192.59
  },
  {
   "day": 20602,
   "date": "2026-05-29",
   "providers": {
    "aws-bedrock": 204.49,
    "google-vertex": 125.4
   },
   "users": 26,
   "total": 329.89
  },
  {
   "day": 20603,
   "date": "2026-05-30",
   "providers": {
    "aws-bedrock": 261.58,
    "google-vertex": 53.1
   },
   "users": 26,
   "total": 314.68
  },
  {
   "day": 20604,
   "date": "2026-05-31",
   "providers": {
    "aws-bedrock": 254.74,
    "google-vertex": 26.18
   },
   "users": 25,
   "total": 280.92
  },
  {
   "day": 20605,
   "date": "2026-06-01",
   "providers": {
    "aws-bedrock": 266.5,
    "google-vertex": 34.4
   },
   "users": 26,
   "total": 300.9
  },
  {
   "day": 20606,
   "date": "2026-06-02",
   "providers": {
    "aws-bedrock": 247.06,
    "google-vertex": 88.86
   },
   "users": 26,
   "total": 335.92
  },
  {
   "day": 20607,
   "date": "2026-06-03",
   "providers": {
    "aws-bedrock": 225.33,
    "google-vertex": 58.99
   },
   "users": 24,
   "total": 284.32
  },
  {
   "day": 20608,
   "date": "2026-06-04",
   "providers": {
    "aws-bedrock": 245.1,
    "google-vertex": 78.79
   },
   "users": 25,
   "total": 323.89
  },
  {
   "day": 20609,
   "date": "2026-06-05",
   "providers": {
    "aws-bedrock": 238.88,
    "google-vertex": 34.51
   },
   "users": 25,
   "total": 273.39
  },
  {
   "day": 20610,
   "date": "2026-06-06",
   "providers": {
    "aws-bedrock": 229.39,
    "google-vertex": 15.53
   },
   "users": 21,
   "total": 244.92
  },
  {
   "day": 20611,
   "date": "2026-06-07",
   "providers": {
    "aws-bedrock": 190.18,
    "google-vertex": 105.21
   },
   "users": 26,
   "total": 295.39
  },
  {
   "day": 20612,
   "date": "2026-06-08",
   "providers": {
    "aws-bedrock": 159.1,
    "google-vertex": 83.38
   },
   "users": 24,
   "total": 242.48
  },
  {
   "day": 20613,
   "date": "2026-06-09",
   "providers": {
    "aws-bedrock": 220.42,
    "google-vertex": 57.92
   },
   "users": 25,
   "total": 278.34
  },
  {
   "day": 20614,
   "date": "2026-06-10",
   "providers": {
    "aws-bedrock": 236.48,
    "google-vertex": 75.39
   },
   "users": 29,
   "total": 311.87
  },
  {
   "day": 20615,
   "date": "2026-06-11",
   "providers": {
    "aws-bedrock": 223.36,
    "google-vertex": 50.4
   },
   "users": 26,
   "total": 273.76
  },
  {
   "day": 20616,
   "date": "2026-06-12",
   "providers": {
    "aws-bedrock": 302.15,
    "google-vertex": 34.34
   },
   "users": 27,
   "total": 336.49
  },
  {
   "day": 20617,
   "date": "2026-06-13",
   "providers": {
    "aws-bedrock": 309.34,
    "google-vertex": 50.56
   },
   "users": 31,
   "total": 359.9
  },
  {
   "day": 20618,
   "date": "2026-06-14",
   "providers": {
    "aws-bedrock": 234.79,
    "google-vertex": 84.34
   },
   "users": 27,
   "total": 319.13
  },
  {
   "day": 20619,
   "date": "2026-06-15",
   "providers": {
    "aws-bedrock": 270.33,
    "google-vertex": 33.28
   },
   "users": 25,
   "total": 303.61
  },
  {
   "day": 20620,
   "date": "2026-06-16",
   "providers": {
    "aws-bedrock": 262.02,
    "google-vertex": 83.98
   },
   "users": 25,
   "total": 346.0
  },
  {
   "day": 20621,
   "date": "2026-06-17",
   "providers": {
    "aws-bedrock": 247.41,
    "google-vertex": 55.08
   },
   "users": 28,
   "total": 302.49
  },
  {
   "day": 20622,
   "date": "2026-06-18",
   "providers": {
    "aws-bedrock": 216.73,
    "google-vertex": 56.46
   },
   "users": 23,
   "total": 273.19
  },
  {
   "day": 20623,
   "date": "2026-06-19",
   "providers": {
    "aws-bedrock": 235.98,
    "google-vertex": 24.28
   },
   "users": 22,
   "total": 260.26
  },
  {
   "day": 20624,
   "date": "2026-06-20",
   "providers": {
    "aws-bedrock": 278.93,
    "google-vertex": 21.4
   },
   "users": 26,
   "total": 300.33
  },
  {
   "day": 20625,
   "date": "2026-06-21",
   "providers": {
    "aws-bedrock": 170.22,
    "google-vertex": 118.41
   },
   "users": 27,
   "total": 288.63
  },
  {
   "day": 20626,
   "date": "2026-06-22",
   "providers": {
    "aws-bedrock": 280.29,
    "google-vertex": 52.5
   },
   "users": 29,
   "total": 332.79
  },
  {
   "day": 20627,
   "date": "2026-06-23",
   "providers": {
    "aws-bedrock": 184.99,
    "google-vertex": 74.11
   },
   "users": 26,
   "total": 259.1
  },
  {
   "day": 20628,
   "date": "2026-06-24",
   "providers": {
    "aws-bedrock": 217.75,
    "google-vertex": 57.83
   },
   "users": 28,
   "total": 275.58
  },
  {
   "day": 20629,
   "date": "2026-06-25",
   "providers": {
    "aws-bedrock": 249.25,
    "google-vertex": 34.96
   },
   "users": 26,
   "total": 284.21
  },
  {
   "day": 20630,
   "date": "2026-06-26",
   "providers": {
    "aws-bedrock": 286.06,
    "google-vertex": 40.91
   },
   "users": 30,
   "total": 326.97
  },
  {
   "day": 20631,
   "date": "2026-06-27",
   "providers": {
    "aws-bedrock": 254.2,
    "google-vertex": 34.92
   },
   "users": 26,
   "total": 289.12
  },
  {
   "day": 20632,
   "date": "2026-06-28",
   "providers": {
    "aws-bedrock": 247.29,
    "google-vertex": 41.9
   },
   "users": 25,
   "total": 289.19
  },
  {
   "day": 20633,
   "date": "2026-06-29",
   "providers": {
    "aws-bedrock": 201.27,
    "google-vertex": 19.45
   },
   "users": 24,
   "total": 220.72
  },
  {
   "day": 20634,
   "date": "2026-06-30",
   "providers": {
    "aws-bedrock": 281.39,
    "google-vertex": 63.3
   },
   "users": 28,
   "total": 344.69
  },
  {
   "day": 20635,
   "date": "2026-07-01",
   "providers": {
    "aws-bedrock": 297.45,
    "google-vertex": 9.87
   },
   "users": 27,
   "total": 307.32
  },
  {
   "day": 20636,
   "date": "2026-07-02",
   "providers": {
    "aws-bedrock": 258.57,
    "google-vertex": 118.29
   },
   "users": 31,
   "total": 376.86
  },
  {
   "day": 20637,
   "date": "2026-07-03",
   "providers": {
    "aws-bedrock": 226.21,
    "google-vertex": 81.05
   },
   "users": 29,
   "total": 307.26
  },
  {
   "day": 20638,
   "date": "2026-07-04",
   "providers": {
    "aws-bedrock": 198.43,
    "google-vertex": 73.45
   },
   "users": 27,
   "total": 271.88
  },
  {
   "day": 20639,
   "date": "2026-07-05",
   "providers": {
    "aws-bedrock": 298.04,
    "google-vertex": 71.96
   },
   "users": 29,
   "total": 370.0
  },
  {
   "day": 20640,
   "date": "2026-07-06",
   "providers": {
    "aws-bedrock": 263.36,
    "google-vertex": 91.43
   },
   "users": 28,
   "total": 354.79
  },
  {
   "day": 20641,
   "date": "2026-07-07",
   "providers": {
    "aws-bedrock": 261.02,
    "google-vertex": 72.65
   },
   "users": 28,
   "total": 333.67
  },
  {
   "day": 20642,
   "date": "2026-07-08",
   "providers": {
    "aws-bedrock": 230.28,
    "google-vertex": 87.97
   },
   "users": 29,
   "total": 318.25
  },
  {
   "day": 20643,
   "date": "2026-07-09",
   "providers": {
    "aws-bedrock": 274.72,
    "google-vertex": 45.3
   },
   "users": 28,
   "total": 320.02
  },
  {
   "day": 20644,
   "date": "2026-07-10",
   "providers": {
    "aws-bedrock": 258.81,
    "google-vertex": 52.23
   },
   "users": 27,
   "total": 311.04
  },
  {
   "day": 20645,
   "date": "2026-07-11",
   "providers": {
    "aws-bedrock": 255.1,
    "google-vertex": 83.5
   },
   "users": 27,
   "total": 338.6
  },
  {
   "day": 20646,
   "date": "2026-07-12",
   "providers": {
    "aws-bedrock": 196.28,
    "google-vertex": 82.37
   },
   "users": 27,
   "total": 278.65
  },
  {
   "day": 20647,
   "date": "2026-07-13",
   "providers": {
    "aws-bedrock": 227.92,
    "google-vertex": 45.54
   },
   "users": 28,
   "total": 273.46
  },
  {
   "day": 20648,
   "date": "2026-07-14",
   "providers": {
    "aws-bedrock": 237.83,
    "google-vertex": 59.32
   },
   "users": 28,
   "total": 297.15
  },
  {
   "day": 20649,
   "date": "2026-07-15",
   "providers": {
    "aws-bedrock": 220.6,
    "google-vertex": 36.73
   },
   "users": 26,
   "total": 257.33
  },
  {
   "day": 20650,
   "date": "2026-07-16",
   "providers": {
    "aws-bedrock": 172.39,
    "google-vertex": 94.21
   },
   "users": 26,
   "total": 266.6
  },
  {
   "day": 20651,
   "date": "2026-07-17",
   "providers": {
    "aws-bedrock": 200.65,
    "google-vertex": 104.38
   },
   "users": 29,
   "total": 305.03
  },
  {
   "day": 20652,
   "date": "2026-07-18",
   "providers": {
    "aws-bedrock": 234.49,
    "google-vertex": 43.65
   },
   "users": 27,
   "total": 278.14
  },
  {
   "day": 20653,
   "date": "2026-07-19",
   "providers": {
    "aws-bedrock": 171.94,
    "google-vertex": 21.92
   },
   "users": 25,
   "total": 193.86
  },
  {
   "day": 20654,
   "date": "2026-07-20",
   "providers": {
    "aws-bedrock": 262.57,
    "google-vertex": 54.81
   },
   "users": 30,
   "total": 317.38
  },
  {
   "day": 20655,
   "date": "2026-07-21",
   "providers": {
    "aws-bedrock": 246.91,
    "google-vertex": 62.32
   },
   "users": 28,
   "total": 309.23
  },
  {
   "day": 20656,
   "date": "2026-07-22",
   "providers": {
    "aws-bedrock": 205.68,
    "google-vertex": 100.04
   },
   "users": 29,
   "total": 305.72
  },
  {
   "day": 20657,
   "date": "2026-07-23",
   "providers": {
    "aws-bedrock": 221.56,
    "google-vertex": 51.05
   },
   "users": 24,
   "total": 272.61
  },
  {
   "day": 20658,
   "date": "2026-07-24",
   "providers": {
    "aws-bedrock": 279.58,
    "google-vertex": 133.32
   },
   "users": 32,
   "total": 412.9
  },
  {
   "day": 20659,
   "date": "2026-07-25",
   "providers": {
    "aws-bedrock": 272.34,
    "google-vertex": 43.01
   },
   "users": 31,
   "total": 315.35
  },
  {
   "day": 20660,
   "date": "2026-07-26",
   "providers": {
    "aws-bedrock": 246.37,
    "google-vertex": 62.7
   },
   "users": 31,
   "total": 309.07
  },
  {
   "day": 20661,
   "date": "2026-07-27",
   "providers": {
    "aws-bedrock": 245.76,
    "google-vertex": 44.33
   },
   "users": 26,
   "total": 290.09
  },
  {
   "day": 20662,
   "date": "2026-07-28",
   "providers": {
    "aws-bedrock": 278.26,
    "google-vertex": 81.53
   },
   "users": 32,
   "total": 359.79
  },
  {
   "day": 20663,
   "date": "2026-07-29",
   "providers": {
    "aws-bedrock": 217.59,
    "google-vertex": 117.04
   },
   "users": 29,
   "total": 334.63
  },
  {
   "day": 20664,
   "date": "2026-07-30",
   "providers": {
    "aws-bedrock": 285.84,
    "google-vertex": 70.19
   },
   "users": 29,
   "total": 356.03
  },
  {
   "day": 20665,
   "date": "2026-07-31",
   "providers": {
    "aws-bedrock": 285.92,
    "google-vertex": 55.01
   },
   "users": 31,
   "total": 340.93
  },
  {
   "day": 20666,
   "date": "2026-08-01",
   "providers": {
    "aws-bedrock": 325.64,
    "google-vertex": 29.69
   },
   "users": 28,
   "total": 355.33
  },
  {
   "day": 20667,
   "date": "2026-08-02",
   "providers": {
    "aws-bedrock": 221.82,
    "google-vertex": 76.9
   },
   "users": 29,
   "total": 298.72
  },
  {
   "day": 20668,
   "date": "2026-08-03",
   "providers": {
    "aws-bedrock": 243.23,
    "google-vertex": 68.48
   },
   "users": 31,
   "total": 311.71
  },
  {
   "day": 20669,
   "date": "2026-08-04",
   "providers": {
    "aws-bedrock": 209.37,
    "google-vertex": 107.17
   },
   "users": 29,
   "total": 316.54
  },
  {
   "day": 20670,
   "date": "2026-08-05",
   "providers": {
    "aws-bedrock": 275.48,
    "google-vertex": 63.97
   },
   "users": 31,
   "total": 339.45
  },
  {
   "day": 20671,
   "date": "2026-08-06",
   "providers": {
    "aws-bedrock": 319.58,
    "google-vertex": 79.49
   },
   "users": 33,
   "total": 399.07
  },
  {
   "day": 20672,
   "date": "2026-08-07",
   "providers": {
    "aws-bedrock": 300.36,
    "google-vertex": 87.25
   },
   "users": 32,
   "total": 387.61
  },
  {
   "day": 20673,
   "date": "2026-08-08",
   "providers": {
    "aws-bedrock": 218.05,
    "google-vertex": 60.96
   },
   "users": 26,
   "total": 279.01
  },
  {
   "day": 20674,
   "date": "2026-08-09",
   "providers": {
    "aws-bedrock": 219.27,
    "google-vertex": 79.34
   },
   "users": 27,
   "total": 298.61
  },
  {
   "day": 20675,
   "date": "2026-08-10",
   "providers": {
    "aws-bedrock": 242.55,
    "google-vertex": 105.49
   },
   "users": 28,
   "total": 348.04
  },
  {
   "day": 20676,
   "date": "2026-08-11",
   "providers": {
    "aws-bedrock": 342.82,
    "google-vertex": 29.02
   },
   "users": 33,
   "total": 371.84
  },
  {
   "day": 20677,
   "date": "2026-08-12",
   "providers": {
    "aws-bedrock": 352.12,
    "google-vertex": 48.67
   },
   "users": 33,
   "total": 400.79
  },
  {
   "day": 20678,
   "date": "2026-08-13",
   "providers": {
    "aws-bedrock": 344.94,
    "google-vertex": 51.44
   },
   "users": 31,
   "total": 396.38
  },
  {
   "day": 20679,
   "date": "2026-08-14",
   "providers": {
    "aws-bedrock": 316.53,
    "google-vertex": 63.42
   },
   "users": 34,
   "total": 379.95
  },
  {
   "day": 20680,
   "date": "2026-08-15",
   "providers": {
    "aws-bedrock": 309.03,
    "google-vertex": 86.99
   },
   "users": 33,
   "total": 396.02
  },
  {
   "day": 20681,
   "date": "2026-08-16",
   "providers": {
    "aws-bedrock": 322.24,
    "google-vertex": 75.21
   },
   "users": 36,
   "total": 397.45
  },
  {
   "day": 20682,
   "date": "2026-08-17",
   "providers": {
    "aws-bedrock": 290.88,
    "google-vertex": 90.62
   },
   "users": 31,
   "total": 381.5
  },
  {
   "day": 20683,
   "date": "2026-08-18",
   "providers": {
    "aws-bedrock": 206.49,
    "google-vertex": 133.01
   },
   "users": 30,
   "total": 339.5
  },
  {
   "day": 20684,
   "date": "2026-08-19",
   "providers": {
    "aws-bedrock": 294.12,
    "google-vertex": 39.12
   },
   "users": 32,
   "total": 333.24
  },
  {
   "day": 20685,
   "date": "2026-08-20",
   "providers": {
    "aws-bedrock": 323.56,
    "google-vertex": 65.96
   },
   "users": 32,
   "total": 389.52
  },
  {
   "day": 20686,
   "date": "2026-08-21",
   "providers": {
    "aws-bedrock": 383.51,
    "google-vertex": 55.23
   },
   "users": 37,
   "total": 438.74
  },
  {
   "day": 20687,
   "date": "2026-08-22",
   "providers": {
    "aws-bedrock": 348.76,
    "google-vertex": 34.68
   },
   "users": 32,
   "total": 383.44
  },
  {
   "day": 20688,
   "date": "2026-08-23",
   "providers": {
    "aws-bedrock": 323.21,
    "google-vertex": 65.01
   },
   "users": 31,
   "total": 388.22
  },
  {
   "day": 20689,
   "date": "2026-08-24",
   "providers": {
    "aws-bedrock": 267.27,
    "google-vertex": 69.85
   },
   "users": 35,
   "total": 337.12
  },
  {
   "day": 20690,
   "date": "2026-08-25",
   "providers": {
    "aws-bedrock": 268.87,
    "google-vertex": 65.88
   },
   "users": 30,
   "total": 334.75
  },
  {
   "day": 20691,
   "date": "2026-08-26",
   "providers": {
    "aws-bedrock": 284.18,
    "google-vertex": 58.59
   },
   "users": 34,
   "total": 342.77
  },
  {
   "day": 20692,
   "date": "2026-08-27",
   "providers": {
    "aws-bedrock": 347.67,
    "google-vertex": 19.8
   },
   "users": 30,
   "total": 367.47
  },
  {
   "day": 20693,
   "date": "2026-08-28",
   "providers": {
    "aws-bedrock": 308.04,
    "google-vertex": 84.41
   },
   "users": 37,
   "total": 392.45
  },
  {
   "day": 20694,
   "date": "2026-08-29",
   "providers": {
    "aws-bedrock": 299.06,
    "google-vertex": 42.63
   },
   "users": 30,
   "total": 341.69
  },
  {
   "day": 20695,
   "date": "2026-08-30",
   "providers": {
    "aws-bedrock": 264.37,
    "google-vertex": 32.32
   },
   "users": 30,
   "total": 296.69
  },
  {
   "day": 20696,
   "date": "2026-08-31",
   "providers": {
    "aws-bedrock": 248.83,
    "google-vertex": 127.99
   },
   "users": 34,
   "total": 376.82
  },
  {
   "day": 20697,
   "date": "2026-09-01",
   "providers": {
    "aws-bedrock": 322.01,
    "google-vertex": 71.29
   },
   "users": 33,
   "total": 393.3
  },
  {
   "day": 20698,
   "date": "2026-09-02",
   "providers": {
    "aws-bedrock": 219.0,
    "google-vertex": 112.8
   },
   "users": 31,
   "total": 331.8
  },
  {
   "day": 20699,
   "date": "2026-09-03",
   "providers": {
    "aws-bedrock": 317.42,
    "google-vertex": 28.07
   },
   "users": 30,
   "total": 345.49
  },
  {
   "day": 20700,
   "date": "2026-09-04",
   "providers": {
    "aws-bedrock": 235.71,
    "google-vertex": 70.64
   },
   "users": 29,
   "total": 306.35
  },
  {
   "day": 20701,
   "date": "2026-09-05",
   "providers": {
    "aws-bedrock": 374.64,
    "google-vertex": 20.38
   },
   "users": 31,
   "total": 395.02
  },
  {
   "day": 20702,
   "date": "2026-09-06",
   "providers": {
    "aws-bedrock": 321.12,
    "google-vertex": 60.98
   },
   "users": 28,
   "total": 382.1
  },
  {
   "day": 20703,
   "date": "2026-09-07",
   "providers": {
    "aws-bedrock": 288.06,
    "google-vertex": 50.68
   },
   "users": 34,
   "total": 338.74
  },
  {
   "day": 20704,
   "date": "2026-09-08",
   "providers": {
    "aws-bedrock": 284.95,
    "google-vertex": 35.21
   },
   "users": 30,
   "total": 320.16
  },
  {
   "day": 20705,
   "date": "2026-09-09",
   "providers": {
    "aws-bedrock": 209.36,
    "google-vertex": 96.59
   },
   "users": 30,
   "total": 305.95
  },
  {
   "day": 20706,
   "date": "2026-09-10",
   "providers": {
    "aws-bedrock": 320.82,
    "google-vertex": 71.31
   },
   "users": 32,
   "total": 392.13
  },
  {
   "day": 20707,
   "date": "2026-09-11",
   "providers": {
    "aws-bedrock": 310.37,
    "google-vertex": 47.4
   },
   "users": 30,
   "total": 357.77
  },
  {
   "day": 20708,
   "date": "2026-09-12",
   "providers": {
    "aws-bedrock": 223.6,
    "google-vertex": 95.59
   },
   "users": 29,
   "total": 319.19
  },
  {
   "day": 20709,
   "date": "2026-09-13",
   "providers": {
    "aws-bedrock": 249.67,
    "google-vertex": 114.08
   },
   "users": 33,
   "total": 363.75
  },
  {
   "day": 20710,
   "date": "2026-09-14",
   "providers": {
    "aws-bedrock": 275.12,
    "google-vertex": 68.36
   },
   "users": 31,
   "total": 343.48
  },
  {
   "day": 20711,
   "date": "2026-09-15",
   "providers": {
    "aws-bedrock": 295.44,
    "google-vertex": 59.22
   },
   "users": 30,
   "total": 354.66
  },
  {
   "day": 20712,
   "date": "2026-09-16",
   "providers": {
    "aws-bedrock": 233.31,
    "google-vertex": 30.4
   },
   "users": 28,
   "total": 263.71
  },
  {
   "day": 20713,
   "date": "2026-09-17",
   "providers": {
    "aws-bedrock": 183.12,
    "google-vertex": 19.68
   },
   "users": 25,
   "total": 202.8
  },
  {
   "day": 20714,
   "date": "2026-09-18",
   "providers": {
    "aws-bedrock": 196.73,
    "google-vertex": 99.52
   },
   "users": 28,
   "total": 296.25
  },
  {
   "day": 20715,
   "date": "2026-09-19",
   "providers": {
    "aws-bedrock": 203.75,
    "google-vertex": 48.57
   },
   "users": 27,
   "total": 252.32
  },
  {
   "day": 20716,
   "date": "2026-09-20",
   "providers": {
    "aws-bedrock": 159.66,
    "google-vertex": 83.28
   },
   "users": 26,
   "total": 242.94
  },
  {
   "day": 20717,
   "date": "2026-09-21",
   "providers": {
    "aws-bedrock": 259.96,
    "google-vertex": 70.61
   },
   "users": 30,
   "total": 330.57
  },
  {
   "day": 20718,
   "date": "2026-09-22",
   "providers": {
    "aws-bedrock": 296.4,
    "google-vertex": 27.07
   },
   "users": 31,
   "total": 323.47
  },
  {
   "day": 20719,
   "date": "2026-09-23",
   "providers": {
    "aws-bedrock": 273.74,
    "google-vertex": 70.02
   },
   "users": 27,
   "total": 343.76
  },
  {
   "day": 20720,
   "date": "2026-09-24",
   "providers": {
    "aws-bedrock": 223.5,
    "google-vertex": 81.23
   },
   "users": 26,
   "total": 304.73
  },
  {
   "day": 20721,
   "date": "2026-09-25",
   "providers": {
    "aws-bedrock": 258.17,
    "google-vertex": 36.5
   },
   "users": 27,
   "total": 294.67
  },
  {
   "day": 20722,
   "date": "2026-09-26",
   "providers": {
    "aws-bedrock": 253.97,
    "google-vertex": 40.45
   },
   "users": 27,
   "total": 294.42
  },
  {
   "day": 20723,
   "date": "2026-09-27",
   "providers": {
    "aws-bedrock": 212.35,
    "google-vertex": 65.87
   },
   "users": 32,
   "total": 278.22
  },
  {
   "day": 20724,
   "date": "2026-09-28",
   "providers": {
    "aws-bedrock": 213.86,
    "google-vertex": 68.23
   },
   "users": 26,
   "total": 282.09
  }
 ],
 "periods": {
  "7": {
   "events_window": {
    "recent": [
     20719,
     20725
    ],
    "prev": [
     20712,
     20718
    ]
   },
   "cost_window": {
    "recent": [
     20718,
     20724
    ],
    "prev": [
     20711,
     20717
    ]
   },
   "users": {
    "recent": 32,
    "prev": 32,
    "delta": 0
   },
   "events": {
    "recent": 3592,
    "prev": 3541,
    "delta": 51
   },
   "sessions_per_day": {
    "recent": 47.285714285714285,
    "prev": 45.42857142857143,
    "delta": 1.857142857142854
   },
   "sessions_total": {
    "recent": 331,
    "prev": 318
   },
   "cost": {
    "recent": 2121.36,
    "prev": 1943.25,
    "change": 9.2,
    "start": 20718,
    "end": 20724,
    "spark_start": 20697,
    "first": 20326,
    "last": 20724,
    "providers": [
     "aws-bedrock",
     "google-vertex"
    ]
   },
   "csv_users": {
    "recent": 36,
    "prev": 36
   },
   "bypass": {
    "numerator": 876,
    "denominator": 3592,
    "rate": 24.4
   },
   "reconciliation": {
    "numerator": 32,
    "denominator": 32,
    "rate": 100.0
   },
   "errors": {
    "total": 39,
    "kinds": 4,
    "stages": [
     [
      "send",
      20
     ],
     [
      "apply_settings",
      10
     ],
     [
      "collect",
      9
     ]
    ]
   },
   "trend": [
    {
     "day": 20712,
     "users": 31,
     "sessions": 52,
     "period": "prev"
    },
    {
     "day": 20713,
     "users": 27,
     "sessions": 44,
     "period": "prev"
    },
    {
     "day": 20714,
     "users": 24,
     "sessions": 40,
     "period": "prev"
    },
    {
     "day": 20715,
     "users": 26,
     "sessions": 42,
     "period": "prev"
    },
    {
     "day": 20716,
     "users": 28,
     "sessions": 48,
     "period": "prev"
    },
    {
     "day": 20717,
     "users": 23,
     "sessions": 43,
     "period": "prev"
    },
    {
     "day": 20718,
     "users": 28,
     "sessions": 49,
     "period": "prev"
    },
    {
     "day": 20719,
     "users": 29,
     "sessions": 49,
     "period": "recent"
    },
    {
     "day": 20720,
     "users": 24,
     "sessions": 43,
     "period": "recent"
    },
    {
     "day": 20721,
     "users": 25,
     "sessions": 45,
     "period": "recent"
    },
    {
     "day": 20722,
     "users": 20,
     "sessions": 36,
     "period": "recent"
    },
    {
     "day": 20723,
     "users": 27,
     "sessions": 47,
     "period": "recent"
    },
    {
     "day": 20724,
     "users": 27,
     "sessions": 52,
     "period": "recent"
    },
    {
     "day": 20725,
     "users": 32,
     "sessions": 59,
     "period": "recent"
    }
   ],
   "skills": {
    "recent": 162,
    "prev": 145,
    "delta": 17,
    "kinds": 3,
    "top": [
     {
      "key": "governance:reapply",
      "calls": 60,
      "share": 37.0
     },
     {
      "key": "brainstorming",
      "calls": 59,
      "share": 36.4
     },
     {
      "key": "systematic-debugging",
      "calls": 43,
      "share": 26.5
     }
    ],
    "rows": [
     {
      "name": "governance:reapply",
      "recent_calls": 60,
      "recent_users": 27,
      "prev_calls": 43,
      "prev_users": 24,
      "calls_diff": 17,
      "users_diff": 3,
      "trend": "up"
     },
     {
      "name": "brainstorming",
      "recent_calls": 59,
      "recent_users": 26,
      "prev_calls": 49,
      "prev_users": 26,
      "calls_diff": 10,
      "users_diff": 0,
      "trend": "up"
     },
     {
      "name": "systematic-debugging",
      "recent_calls": 43,
      "recent_users": 25,
      "prev_calls": 53,
      "prev_users": 27,
      "calls_diff": -10,
      "users_diff": -2,
      "trend": "down"
     }
    ],
    "row_count": 3
   },
   "commands": {
    "recent": 549,
    "prev": 530,
    "delta": 19,
    "kinds": 3,
    "top": [
     {
      "key": "review",
      "calls": 195,
      "share": 35.5
     },
     {
      "key": "governance:reapply",
      "calls": 178,
      "share": 32.4
     },
     {
      "key": "deploy",
      "calls": 176,
      "share": 32.1
     }
    ],
    "rows": [
     {
      "name": "review",
      "source": "userSettings",
      "recent_calls": 171,
      "recent_users": 32,
      "prev_calls": 166,
      "prev_users": 32,
      "calls_diff": 5,
      "users_diff": 0,
      "trend": "up"
     },
     {
      "name": "deploy",
      "source": "userSettings",
      "recent_calls": 160,
      "recent_users": 32,
      "prev_calls": 153,
      "prev_users": 32,
      "calls_diff": 7,
      "users_diff": 0,
      "trend": "up"
     },
     {
      "name": "governance:reapply",
      "source": "plugin",
      "recent_calls": 154,
      "recent_users": 32,
      "prev_calls": 161,
      "prev_users": 32,
      "calls_diff": -7,
      "users_diff": 0,
      "trend": "down"
     },
     {
      "name": "governance:reapply",
      "source": null,
      "recent_calls": 24,
      "recent_users": 19,
      "prev_calls": 21,
      "prev_users": 17,
      "calls_diff": 3,
      "users_diff": 2,
      "trend": "up"
     },
     {
      "name": "review",
      "source": null,
      "recent_calls": 24,
      "recent_users": 16,
      "prev_calls": 15,
      "prev_users": 12,
      "calls_diff": 9,
      "users_diff": 4,
      "trend": "up"
     },
     {
      "name": "deploy",
      "source": null,
      "recent_calls": 16,
      "recent_users": 12,
      "prev_calls": 14,
      "prev_users": 8,
      "calls_diff": 2,
      "users_diff": 4,
      "trend": "up"
     }
    ],
    "row_count": 6
   },
   "agent": {
    "numerator": 167,
    "denominator": 3592,
    "rate": 4.6,
    "rows": [
     {
      "kind": "agent",
      "count": 167,
      "share": 4.6
     },
     {
      "kind": "main",
      "count": 3425,
      "share": 95.4
     }
    ]
   }
  },
  "28": {
   "events_window": {
    "recent": [
     20698,
     20725
    ],
    "prev": [
     20670,
     20697
    ]
   },
   "cost_window": {
    "recent": [
     20697,
     20724
    ],
    "prev": [
     20669,
     20696
    ]
   },
   "users": {
    "recent": 36,
    "prev": 35,
    "delta": 1
   },
   "events": {
    "recent": 14742,
    "prev": 15227,
    "delta": -485
   },
   "sessions_per_day": {
    "recent": 47.5,
    "prev": 49.035714285714285,
    "delta": -1.5357142857142847
   },
   "sessions_total": {
    "recent": 1330,
    "prev": 1373
   },
   "cost": {
    "recent": 8959.839999999998,
    "prev": 10154.68,
    "change": -11.8,
    "start": 20697,
    "end": 20724,
    "spark_start": 20697,
    "first": 20326,
    "last": 20724,
    "providers": [
     "aws-bedrock",
     "google-vertex"
    ]
   },
   "csv_users": {
    "recent": 40,
    "prev": 40
   },
   "bypass": {
    "numerator": 3686,
    "denominator": 14742,
    "rate": 25.0
   },
   "reconciliation": {
    "numerator": 36,
    "denominator": 36,
    "rate": 100.0
   },
   "errors": {
    "total": 44,
    "kinds": 4,
    "stages": [
     [
      "send",
      22
     ],
     [
      "apply_settings",
      11
     ],
     [
      "collect",
      11
     ]
    ]
   },
   "trend": [
    {
     "day": 20670,
     "users": 31,
     "sessions": 50,
     "period": "prev"
    },
    {
     "day": 20671,
     "users": 27,
     "sessions": 50,
     "period": "prev"
    },
    {
     "day": 20672,
     "users": 26,
     "sessions": 45,
     "period": "prev"
    },
    {
     "day": 20673,
     "users": 21,
     "sessions": 35,
     "period": "prev"
    },
    {
     "day": 20674,
     "users": 25,
     "sessions": 46,
     "period": "prev"
    },
    {
     "day": 20675,
     "users": 28,
     "sessions": 53,
     "period": "prev"
    },
    {
     "day": 20676,
     "users": 24,
     "sessions": 38,
     "period": "prev"
    },
    {
     "day": 20677,
     "users": 32,
     "sessions": 55,
     "period": "prev"
    },
    {
     "day": 20678,
     "users": 28,
     "sessions": 56,
     "period": "prev"
    },
    {
     "day": 20679,
     "users": 28,
     "sessions": 51,
     "period": "prev"
    },
    {
     "day": 20680,
     "users": 25,
     "sessions": 39,
     "period": "prev"
    },
    {
     "day": 20681,
     "users": 29,
     "sessions": 48,
     "period": "prev"
    },
    {
     "day": 20682,
     "users": 30,
     "sessions": 49,
     "period": "prev"
    },
    {
     "day": 20683,
     "users": 29,
     "sessions": 59,
     "period": "prev"
    },
    {
     "day": 20684,
     "users": 29,
     "sessions": 58,
     "period": "prev"
    },
    {
     "day": 20685,
     "users": 28,
     "sessions": 51,
     "period": "prev"
    },
    {
     "day": 20686,
     "users": 29,
     "sessions": 50,
     "period": "prev"
    },
    {
     "day": 20687,
     "users": 30,
     "sessions": 52,
     "period": "prev"
    },
    {
     "day": 20688,
     "users": 26,
     "sessions": 41,
     "period": "prev"
    },
    {
     "day": 20689,
     "users": 28,
     "sessions": 53,
     "period": "prev"
    },
    {
     "day": 20690,
     "users": 28,
     "sessions": 52,
     "period": "prev"
    },
    {
     "day": 20691,
     "users": 27,
     "sessions": 50,
     "period": "prev"
    },
    {
     "day": 20692,
     "users": 30,
     "sessions": 48,
     "period": "prev"
    },
    {
     "day": 20693,
     "users": 27,
     "sessions": 49,
     "period": "prev"
    },
    {
     "day": 20694,
     "users": 28,
     "sessions": 44,
     "period": "prev"
    },
    {
     "day": 20695,
     "users": 32,
     "sessions": 63,
     "period": "prev"
    },
    {
     "day": 20696,
     "users": 26,
     "sessions": 45,
     "period": "prev"
    },
    {
     "day": 20697,
     "users": 28,
     "sessions": 43,
     "period": "prev"
    },
    {
     "day": 20698,
     "users": 25,
     "sessions": 48,
     "period": "recent"
    },
    {
     "day": 20699,
     "users": 30,
     "sessions": 46,
     "period": "recent"
    },
    {
     "day": 20700,
     "users": 29,
     "sessions": 50,
     "period": "recent"
    },
    {
     "day": 20701,
     "users": 31,
     "sessions": 57,
     "period": "recent"
    },
    {
     "day": 20702,
     "users": 27,
     "sessions": 45,
     "period": "recent"
    },
    {
     "day": 20703,
     "users": 26,
     "sessions": 45,
     "period": "recent"
    },
    {
     "day": 20704,
     "users": 29,
     "sessions": 54,
     "period": "recent"
    },
    {
     "day": 20705,
     "users": 30,
     "sessions": 52,
     "period": "recent"
    },
    {
     "day": 20706,
     "users": 29,
     "sessions": 51,
     "period": "recent"
    },
    {
     "day": 20707,
     "users": 28,
     "sessions": 48,
     "period": "recent"
    },
    {
     "day": 20708,
     "users": 28,
     "sessions": 48,
     "period": "recent"
    },
    {
     "day": 20709,
     "users": 27,
     "sessions": 49,
     "period": "recent"
    },
    {
     "day": 20710,
     "users": 24,
     "sessions": 42,
     "period": "recent"
    },
    {
     "day": 20711,
     "users": 29,
     "sessions": 46,
     "period": "recent"
    },
    {
     "day": 20712,
     "users": 31,
     "sessions": 52,
     "period": "recent"
    },
    {
     "day": 20713,
     "users": 27,
     "sessions": 44,
     "period": "recent"
    },
    {
     "day": 20714,
     "users": 24,
     "sessions": 40,
     "period": "recent"
    },
    {
     "day": 20715,
     "users": 26,
     "sessions": 42,
     "period": "recent"
    },
    {
     "day": 20716,
     "users": 28,
     "sessions": 48,
     "period": "recent"
    },
    {
     "day": 20717,
     "users": 23,
     "sessions": 43,
     "period": "recent"
    },
    {
     "day": 20718,
     "users": 28,
     "sessions": 49,
     "period": "recent"
    },
    {
     "day": 20719,
     "users": 29,
     "sessions": 49,
     "period": "recent"
    },
    {
     "day": 20720,
     "users": 24,
     "sessions": 43,
     "period": "recent"
    },
    {
     "day": 20721,
     "users": 25,
     "sessions": 45,
     "period": "recent"
    },
    {
     "day": 20722,
     "users": 20,
     "sessions": 36,
     "period": "recent"
    },
    {
     "day": 20723,
     "users": 27,
     "sessions": 47,
     "period": "recent"
    },
    {
     "day": 20724,
     "users": 27,
     "sessions": 52,
     "period": "recent"
    },
    {
     "day": 20725,
     "users": 32,
     "sessions": 59,
     "period": "recent"
    }
   ],
   "skills": {
    "recent": 655,
    "prev": 692,
    "delta": -37,
    "kinds": 3,
    "top": [
     {
      "key": "brainstorming",
      "calls": 232,
      "share": 35.4
     },
     {
      "key": "governance:reapply",
      "calls": 217,
      "share": 33.1
     },
     {
      "key": "systematic-debugging",
      "calls": 206,
      "share": 31.5
     }
    ],
    "rows": [
     {
      "name": "brainstorming",
      "recent_calls": 232,
      "recent_users": 34,
      "prev_calls": 232,
      "prev_users": 35,
      "calls_diff": 0,
      "users_diff": -1,
      "trend": "flat"
     },
     {
      "name": "governance:reapply",
      "recent_calls": 217,
      "recent_users": 35,
      "prev_calls": 265,
      "prev_users": 35,
      "calls_diff": -48,
      "users_diff": 0,
      "trend": "down"
     },
     {
      "name": "systematic-debugging",
      "recent_calls": 206,
      "recent_users": 35,
      "prev_calls": 195,
      "prev_users": 34,
      "calls_diff": 11,
      "users_diff": 1,
      "trend": "up"
     }
    ],
    "row_count": 3
   },
   "commands": {
    "recent": 2202,
    "prev": 2332,
    "delta": -130,
    "kinds": 3,
    "top": [
     {
      "key": "review",
      "calls": 757,
      "share": 34.4
     },
     {
      "key": "governance:reapply",
      "calls": 750,
      "share": 34.1
     },
     {
      "key": "deploy",
      "calls": 695,
      "share": 31.6
     }
    ],
    "rows": [
     {
      "name": "review",
      "source": "userSettings",
      "recent_calls": 685,
      "recent_users": 35,
      "prev_calls": 731,
      "prev_users": 35,
      "calls_diff": -46,
      "users_diff": 0,
      "trend": "down"
     },
     {
      "name": "governance:reapply",
      "source": "plugin",
      "recent_calls": 662,
      "recent_users": 35,
      "prev_calls": 694,
      "prev_users": 35,
      "calls_diff": -32,
      "users_diff": 0,
      "trend": "down"
     },
     {
      "name": "deploy",
      "source": "userSettings",
      "recent_calls": 626,
      "recent_users": 35,
      "prev_calls": 679,
      "prev_users": 35,
      "calls_diff": -53,
      "users_diff": 0,
      "trend": "down"
     },
     {
      "name": "governance:reapply",
      "source": null,
      "recent_calls": 88,
      "recent_users": 28,
      "prev_calls": 65,
      "prev_users": 28,
      "calls_diff": 23,
      "users_diff": 0,
      "trend": "up"
     },
     {
      "name": "review",
      "source": null,
      "recent_calls": 72,
      "recent_users": 27,
      "prev_calls": 91,
      "prev_users": 33,
      "calls_diff": -19,
      "users_diff": -6,
      "trend": "down"
     },
     {
      "name": "deploy",
      "source": null,
      "recent_calls": 69,
      "recent_users": 28,
      "prev_calls": 72,
      "prev_users": 31,
      "calls_diff": -3,
      "users_diff": -3,
      "trend": "down"
     }
    ],
    "row_count": 6
   },
   "agent": {
    "numerator": 665,
    "denominator": 14742,
    "rate": 4.5,
    "rows": [
     {
      "kind": "agent",
      "count": 665,
      "share": 4.5
     },
     {
      "kind": "main",
      "count": 14077,
      "share": 95.5
     }
    ]
   }
  }
 },
 "twelve_months": {
  "weeks": [
   {
    "start": "2025-09-29",
    "end": "2025-10-05",
    "days_with_data": 7,
    "partial": false,
    "cost": 887.55,
    "providers": {
     "aws-bedrock": 662.77,
     "google-vertex": 224.78
    },
    "users": 13
   },
   {
    "start": "2025-10-06",
    "end": "2025-10-12",
    "days_with_data": 7,
    "partial": false,
    "cost": 839.12,
    "providers": {
     "aws-bedrock": 568.54,
     "google-vertex": 270.58
    },
    "users": 13
   },
   {
    "start": "2025-10-13",
    "end": "2025-10-19",
    "days_with_data": 7,
    "partial": false,
    "cost": 922.57,
    "providers": {
     "aws-bedrock": 700.99,
     "google-vertex": 221.58
    },
    "users": 13
   },
   {
    "start": "2025-10-20",
    "end": "2025-10-26",
    "days_with_data": 7,
    "partial": false,
    "cost": 750.94,
    "providers": {
     "aws-bedrock": 584.2,
     "google-vertex": 166.74
    },
    "users": 13
   },
   {
    "start": "2025-10-27",
    "end": "2025-11-02",
    "days_with_data": 7,
    "partial": false,
    "cost": 887.65,
    "providers": {
     "aws-bedrock": 709.02,
     "google-vertex": 178.63
    },
    "users": 13
   },
   {
    "start": "2025-11-03",
    "end": "2025-11-09",
    "days_with_data": 7,
    "partial": false,
    "cost": 936.69,
    "providers": {
     "aws-bedrock": 777.7,
     "google-vertex": 158.99
    },
    "users": 15
   },
   {
    "start": "2025-11-10",
    "end": "2025-11-16",
    "days_with_data": 7,
    "partial": false,
    "cost": 1040.28,
    "providers": {
     "aws-bedrock": 835.78,
     "google-vertex": 204.5
    },
    "users": 17
   },
   {
    "start": "2025-11-17",
    "end": "2025-11-23",
    "days_with_data": 7,
    "partial": false,
    "cost": 998.34,
    "providers": {
     "aws-bedrock": 757.73,
     "google-vertex": 240.61
    },
    "users": 17
   },
   {
    "start": "2025-11-24",
    "end": "2025-11-30",
    "days_with_data": 7,
    "partial": false,
    "cost": 1169.54,
    "providers": {
     "aws-bedrock": 842.18,
     "google-vertex": 327.36
    },
    "users": 18
   },
   {
    "start": "2025-12-01",
    "end": "2025-12-07",
    "days_with_data": 7,
    "partial": false,
    "cost": 1243.88,
    "providers": {
     "aws-bedrock": 1026.87,
     "google-vertex": 217.01
    },
    "users": 18
   },
   {
    "start": "2025-12-08",
    "end": "2025-12-14",
    "days_with_data": 7,
    "partial": false,
    "cost": 1027.92,
    "providers": {
     "aws-bedrock": 813.92,
     "google-vertex": 214.0
    },
    "users": 20
   },
   {
    "start": "2025-12-15",
    "end": "2025-12-21",
    "days_with_data": 7,
    "partial": false,
    "cost": 1265.89,
    "providers": {
     "aws-bedrock": 1018.29,
     "google-vertex": 247.6
    },
    "users": 21
   },
   {
    "start": "2025-12-22",
    "end": "2025-12-28",
    "days_with_data": 7,
    "partial": false,
    "cost": 1336.97,
    "providers": {
     "aws-bedrock": 1083.15,
     "google-vertex": 253.82
    },
    "users": 21
   },
   {
    "start": "2025-12-29",
    "end": "2026-01-04",
    "days_with_data": 7,
    "partial": false,
    "cost": 1413.56,
    "providers": {
     "aws-bedrock": 1146.91,
     "google-vertex": 266.65
    },
    "users": 22
   },
   {
    "start": "2026-01-05",
    "end": "2026-01-11",
    "days_with_data": 7,
    "partial": false,
    "cost": 1542.52,
    "providers": {
     "aws-bedrock": 1198.95,
     "google-vertex": 343.57
    },
    "users": 23
   },
   {
    "start": "2026-01-12",
    "end": "2026-01-18",
    "days_with_data": 7,
    "partial": false,
    "cost": 1378.0,
    "providers": {
     "aws-bedrock": 1044.23,
     "google-vertex": 333.77
    },
    "users": 23
   },
   {
    "start": "2026-01-19",
    "end": "2026-01-25",
    "days_with_data": 7,
    "partial": false,
    "cost": 1445.46,
    "providers": {
     "aws-bedrock": 1138.2,
     "google-vertex": 307.26
    },
    "users": 23
   },
   {
    "start": "2026-01-26",
    "end": "2026-02-01",
    "days_with_data": 7,
    "partial": false,
    "cost": 1566.18,
    "providers": {
     "aws-bedrock": 1281.98,
     "google-vertex": 284.2
    },
    "users": 23
   },
   {
    "start": "2026-02-02",
    "end": "2026-02-08",
    "days_with_data": 7,
    "partial": false,
    "cost": 1453.77,
    "providers": {
     "aws-bedrock": 1156.51,
     "google-vertex": 297.26
    },
    "users": 24
   },
   {
    "start": "2026-02-09",
    "end": "2026-02-15",
    "days_with_data": 7,
    "partial": false,
    "cost": 1525.3,
    "providers": {
     "aws-bedrock": 1279.52,
     "google-vertex": 245.78
    },
    "users": 24
   },
   {
    "start": "2026-02-16",
    "end": "2026-02-22",
    "days_with_data": 7,
    "partial": false,
    "cost": 1428.78,
    "providers": {
     "aws-bedrock": 1154.39,
     "google-vertex": 274.39
    },
    "users": 24
   },
   {
    "start": "2026-02-23",
    "end": "2026-03-01",
    "days_with_data": 7,
    "partial": false,
    "cost": 1490.17,
    "providers": {
     "aws-bedrock": 1240.88,
     "google-vertex": 249.29
    },
    "users": 24
   },
   {
    "start": "2026-03-02",
    "end": "2026-03-08",
    "days_with_data": 7,
    "partial": false,
    "cost": 1622.97,
    "providers": {
     "aws-bedrock": 1387.63,
     "google-vertex": 235.34
    },
    "users": 25
   },
   {
    "start": "2026-03-09",
    "end": "2026-03-15",
    "days_with_data": 7,
    "partial": false,
    "cost": 1560.14,
    "providers": {
     "aws-bedrock": 1317.92,
     "google-vertex": 242.22
    },
    "users": 25
   },
   {
    "start": "2026-03-16",
    "end": "2026-03-22",
    "days_with_data": 7,
    "partial": false,
    "cost": 1622.6,
    "providers": {
     "aws-bedrock": 1368.83,
     "google-vertex": 253.77
    },
    "users": 25
   },
   {
    "start": "2026-03-23",
    "end": "2026-03-29",
    "days_with_data": 7,
    "partial": false,
    "cost": 1597.53,
    "providers": {
     "aws-bedrock": 1281.55,
     "google-vertex": 315.98
    },
    "users": 26
   },
   {
    "start": "2026-03-30",
    "end": "2026-04-05",
    "days_with_data": 7,
    "partial": false,
    "cost": 1621.93,
    "providers": {
     "aws-bedrock": 1386.74,
     "google-vertex": 235.19
    },
    "users": 26
   },
   {
    "start": "2026-04-06",
    "end": "2026-04-12",
    "days_with_data": 7,
    "partial": false,
    "cost": 1588.27,
    "providers": {
     "aws-bedrock": 1192.4,
     "google-vertex": 395.87
    },
    "users": 26
   },
   {
    "start": "2026-04-13",
    "end": "2026-04-19",
    "days_with_data": 7,
    "partial": false,
    "cost": 1712.43,
    "providers": {
     "aws-bedrock": 1431.0,
     "google-vertex": 281.43
    },
    "users": 27
   },
   {
    "start": "2026-04-20",
    "end": "2026-04-26",
    "days_with_data": 7,
    "partial": false,
    "cost": 1794.74,
    "providers": {
     "aws-bedrock": 1442.26,
     "google-vertex": 352.48
    },
    "users": 27
   },
   {
    "start": "2026-04-27",
    "end": "2026-05-03",
    "days_with_data": 7,
    "partial": false,
    "cost": 1690.68,
    "providers": {
     "aws-bedrock": 1355.12,
     "google-vertex": 335.56
    },
    "users": 28
   },
   {
    "start": "2026-05-04",
    "end": "2026-05-10",
    "days_with_data": 7,
    "partial": false,
    "cost": 1786.75,
    "providers": {
     "aws-bedrock": 1450.12,
     "google-vertex": 336.63
    },
    "users": 29
   },
   {
    "start": "2026-05-11",
    "end": "2026-05-17",
    "days_with_data": 7,
    "partial": false,
    "cost": 1817.81,
    "providers": {
     "aws-bedrock": 1458.02,
     "google-vertex": 359.79
    },
    "users": 29
   },
   {
    "start": "2026-05-18",
    "end": "2026-05-24",
    "days_with_data": 7,
    "partial": false,
    "cost": 1864.83,
    "providers": {
     "aws-bedrock": 1507.3,
     "google-vertex": 357.53
    },
    "users": 30
   },
   {
    "start": "2026-05-25",
    "end": "2026-05-31",
    "days_with_data": 7,
    "partial": false,
    "cost": 2041.24,
    "providers": {
     "aws-bedrock": 1653.44,
     "google-vertex": 387.8
    },
    "users": 31
   },
   {
    "start": "2026-06-01",
    "end": "2026-06-07",
    "days_with_data": 7,
    "partial": false,
    "cost": 2058.73,
    "providers": {
     "aws-bedrock": 1642.44,
     "google-vertex": 416.29
    },
    "users": 32
   },
   {
    "start": "2026-06-08",
    "end": "2026-06-14",
    "days_with_data": 7,
    "partial": false,
    "cost": 2121.97,
    "providers": {
     "aws-bedrock": 1685.64,
     "google-vertex": 436.33
    },
    "users": 33
   },
   {
    "start": "2026-06-15",
    "end": "2026-06-21",
    "days_with_data": 7,
    "partial": false,
    "cost": 2074.51,
    "providers": {
     "aws-bedrock": 1681.62,
     "google-vertex": 392.89
    },
    "users": 33
   },
   {
    "start": "2026-06-22",
    "end": "2026-06-28",
    "days_with_data": 7,
    "partial": false,
    "cost": 2056.96,
    "providers": {
     "aws-bedrock": 1719.83,
     "google-vertex": 337.13
    },
    "users": 34
   },
   {
    "start": "2026-06-29",
    "end": "2026-07-05",
    "days_with_data": 7,
    "partial": false,
    "cost": 2198.73,
    "providers": {
     "aws-bedrock": 1761.36,
     "google-vertex": 437.37
    },
    "users": 35
   },
   {
    "start": "2026-07-06",
    "end": "2026-07-12",
    "days_with_data": 7,
    "partial": false,
    "cost": 2255.02,
    "providers": {
     "aws-bedrock": 1739.57,
     "google-vertex": 515.45
    },
    "users": 35
   },
   {
    "start": "2026-07-13",
    "end": "2026-07-19",
    "days_with_data": 7,
    "partial": false,
    "cost": 1871.57,
    "providers": {
     "aws-bedrock": 1465.82,
     "google-vertex": 405.75
    },
    "users": 36
   },
   {
    "start": "2026-07-20",
    "end": "2026-07-26",
    "days_with_data": 7,
    "partial": false,
    "cost": 2242.26,
    "providers": {
     "aws-bedrock": 1735.01,
     "google-vertex": 507.25
    },
    "users": 37
   },
   {
    "start": "2026-07-27",
    "end": "2026-08-02",
    "days_with_data": 7,
    "partial": false,
    "cost": 2335.52,
    "providers": {
     "aws-bedrock": 1860.83,
     "google-vertex": 474.69
    },
    "users": 38
   },
   {
    "start": "2026-08-03",
    "end": "2026-08-09",
    "days_with_data": 7,
    "partial": false,
    "cost": 2332.0,
    "providers": {
     "aws-bedrock": 1785.34,
     "google-vertex": 546.66
    },
    "users": 39
   },
   {
    "start": "2026-08-10",
    "end": "2026-08-16",
    "days_with_data": 7,
    "partial": false,
    "cost": 2690.47,
    "providers": {
     "aws-bedrock": 2230.23,
     "google-vertex": 460.24
    },
    "users": 39
   },
   {
    "start": "2026-08-17",
    "end": "2026-08-23",
    "days_with_data": 7,
    "partial": false,
    "cost": 2654.16,
    "providers": {
     "aws-bedrock": 2170.53,
     "google-vertex": 483.63
    },
    "users": 40
   },
   {
    "start": "2026-08-24",
    "end": "2026-08-30",
    "days_with_data": 7,
    "partial": false,
    "cost": 2412.94,
    "providers": {
     "aws-bedrock": 2039.46,
     "google-vertex": 373.48
    },
    "users": 40
   },
   {
    "start": "2026-08-31",
    "end": "2026-09-06",
    "days_with_data": 7,
    "partial": false,
    "cost": 2530.88,
    "providers": {
     "aws-bedrock": 2038.73,
     "google-vertex": 492.15
    },
    "users": 40
   },
   {
    "start": "2026-09-07",
    "end": "2026-09-13",
    "days_with_data": 7,
    "partial": false,
    "cost": 2397.69,
    "providers": {
     "aws-bedrock": 1886.83,
     "google-vertex": 510.86
    },
    "users": 36
   },
   {
    "start": "2026-09-14",
    "end": "2026-09-20",
    "days_with_data": 7,
    "partial": false,
    "cost": 1956.16,
    "providers": {
     "aws-bedrock": 1547.13,
     "google-vertex": 409.03
    },
    "users": 36
   },
   {
    "start": "2026-09-21",
    "end": "2026-09-27",
    "days_with_data": 7,
    "partial": false,
    "cost": 2169.84,
    "providers": {
     "aws-bedrock": 1778.09,
     "google-vertex": 391.75
    },
    "users": 36
   },
   {
    "start": "2026-09-28",
    "end": "2026-09-28",
    "days_with_data": 1,
    "partial": true,
    "cost": 282.09,
    "providers": {
     "aws-bedrock": 213.86,
     "google-vertex": 68.23
    },
    "users": 26
   }
  ],
  "month_first_week": [
   {
    "month": "2025-09",
    "week_index": 0
   },
   {
    "month": "2025-10",
    "week_index": 1
   },
   {
    "month": "2025-11",
    "week_index": 5
   },
   {
    "month": "2025-12",
    "week_index": 9
   },
   {
    "month": "2026-01",
    "week_index": 14
   },
   {
    "month": "2026-02",
    "week_index": 18
   },
   {
    "month": "2026-03",
    "week_index": 22
   },
   {
    "month": "2026-04",
    "week_index": 27
   },
   {
    "month": "2026-05",
    "week_index": 31
   },
   {
    "month": "2026-06",
    "week_index": 35
   },
   {
    "month": "2026-07",
    "week_index": 40
   },
   {
    "month": "2026-08",
    "week_index": 44
   },
   {
    "month": "2026-09",
    "week_index": 49
   }
  ],
  "note": "月の最初の週 = 月曜がその月に入る最初の週。最初の月は範囲の途中から始まる"
 },
 "month_forecast": {
  "month": "2026-09",
  "as_of": "2026-09-28",
  "business_days": 19,
  "elapsed_business_days": 17,
  "actual": 8959.84,
  "forecast": 10013.94,
  "per_business_day": 527.05,
  "prev_month": "2026-08",
  "prev_business_days": 20,
  "prev_total": 11120.44,
  "prev_per_business_day": 556.02,
  "holidays": [
   {
    "date": "2026-08-11",
    "name": "山の日"
   },
   {
    "date": "2026-09-21",
    "name": "敬老の日"
   },
   {
    "date": "2026-09-22",
    "name": "国民の休日"
   },
   {
    "date": "2026-09-23",
    "name": "秋分の日"
   }
  ],
  "business_day_list": [
   "2026-09-01",
   "2026-09-02",
   "2026-09-03",
   "2026-09-04",
   "2026-09-07",
   "2026-09-08",
   "2026-09-09",
   "2026-09-10",
   "2026-09-11",
   "2026-09-14",
   "2026-09-15",
   "2026-09-16",
   "2026-09-17",
   "2026-09-18",
   "2026-09-24",
   "2026-09-25",
   "2026-09-28",
   "2026-09-29",
   "2026-09-30"
  ],
  "forecast_by_day": [
   {
    "as_of": "2026-09-01",
    "elapsed_business_days": 1,
    "actual": 393.3,
    "forecast": 7472.7
   },
   {
    "as_of": "2026-09-02",
    "elapsed_business_days": 2,
    "actual": 725.1,
    "forecast": 6888.45
   },
   {
    "as_of": "2026-09-03",
    "elapsed_business_days": 3,
    "actual": 1070.59,
    "forecast": 6780.4
   },
   {
    "as_of": "2026-09-04",
    "elapsed_business_days": 4,
    "actual": 1376.94,
    "forecast": 6540.47
   },
   {
    "as_of": "2026-09-05",
    "elapsed_business_days": 4,
    "actual": 1771.96,
    "forecast": 8416.81
   },
   {
    "as_of": "2026-09-06",
    "elapsed_business_days": 4,
    "actual": 2154.06,
    "forecast": 10231.78
   },
   {
    "as_of": "2026-09-07",
    "elapsed_business_days": 5,
    "actual": 2492.8,
    "forecast": 9472.64
   },
   {
    "as_of": "2026-09-08",
    "elapsed_business_days": 6,
    "actual": 2812.96,
    "forecast": 8907.71
   },
   {
    "as_of": "2026-09-09",
    "elapsed_business_days": 7,
    "actual": 3118.91,
    "forecast": 8465.61
   },
   {
    "as_of": "2026-09-10",
    "elapsed_business_days": 8,
    "actual": 3511.04,
    "forecast": 8338.72
   },
   {
    "as_of": "2026-09-11",
    "elapsed_business_days": 9,
    "actual": 3868.81,
    "forecast": 8167.49
   },
   {
    "as_of": "2026-09-12",
    "elapsed_business_days": 9,
    "actual": 4188.0,
    "forecast": 8841.33
   },
   {
    "as_of": "2026-09-13",
    "elapsed_business_days": 9,
    "actual": 4551.75,
    "forecast": 9609.25
   },
   {
    "as_of": "2026-09-14",
    "elapsed_business_days": 10,
    "actual": 4895.23,
    "forecast": 9300.94
   },
   {
    "as_of": "2026-09-15",
    "elapsed_business_days": 11,
    "actual": 5249.89,
    "forecast": 9067.99
   },
   {
    "as_of": "2026-09-16",
    "elapsed_business_days": 12,
    "actual": 5513.6,
    "forecast": 8729.87
   },
   {
    "as_of": "2026-09-17",
    "elapsed_business_days": 13,
    "actual": 5716.4,
    "forecast": 8354.74
   },
   {
    "as_of": "2026-09-18",
    "elapsed_business_days": 14,
    "actual": 6012.65,
    "forecast": 8160.02
   },
   {
    "as_of": "2026-09-19",
    "elapsed_business_days": 14,
    "actual": 6264.97,
    "forecast": 8502.46
   },
   {
    "as_of": "2026-09-20",
    "elapsed_business_days": 14,
    "actual": 6507.91,
    "forecast": 8832.16
   },
   {
    "as_of": "2026-09-21",
    "elapsed_business_days": 14,
    "actual": 6838.48,
    "forecast": 9280.79
   },
   {
    "as_of": "2026-09-22",
    "elapsed_business_days": 14,
    "actual": 7161.95,
    "forecast": 9719.79
   },
   {
    "as_of": "2026-09-23",
    "elapsed_business_days": 14,
    "actual": 7505.71,
    "forecast": 10186.32
   },
   {
    "as_of": "2026-09-24",
    "elapsed_business_days": 15,
    "actual": 7810.44,
    "forecast": 9893.22
   },
   {
    "as_of": "2026-09-25",
    "elapsed_business_days": 16,
    "actual": 8105.11,
    "forecast": 9624.82
   },
   {
    "as_of": "2026-09-26",
    "elapsed_business_days": 16,
    "actual": 8399.53,
    "forecast": 9974.44
   },
   {
    "as_of": "2026-09-27",
    "elapsed_business_days": 16,
    "actual": 8677.75,
    "forecast": 10304.83
   },
   {
    "as_of": "2026-09-28",
    "elapsed_business_days": 17,
    "actual": 8959.84,
    "forecast": 10013.94
   }
  ],
  "note": "経過営業日が少ないと「—」にする閾値は未定。forecast_by_day で日ごとの見込みを並べた"
 },
 "tokens": {
  "definition": "input + output + cache_read + cache_write（cost_daily）",
  "per_user_day_avg": 1630740,
  "per_user_day_min": 391869,
  "per_user_day_max": 3458568,
  "one_day_all_users": 38893823,
  "per_user_7d_avg": 8684760,
  "total_7d": 312651371,
  "total_28d": 1295218012,
  "total_365d": 12605858277,
  "output_per_user_day_avg": 35181,
  "context_tokens_avg": 66253,
  "context_tokens_max": 179957,
  "rule": "100 万未満は k、100 万以上は M（桁の丸めは案で決める）"
 },
 "export": {
  "tables": [
   "events",
   "policy_state",
   "cost_daily",
   "errors"
  ],
  "columns": {
   "events": [
    "event_id",
    "ts",
    "day",
    "user_email",
    "host",
    "hook_event",
    "context_tokens",
    "claude_code_version",
    "session_id",
    "prompt_id",
    "tool_name",
    "source",
    "compact_trigger",
    "command_name",
    "command_source",
    "skill_name",
    "effort_level",
    "permission_mode",
    "agent_id",
    "is_interrupt"
   ],
   "policy_state": [
    "event_id",
    "ts",
    "day",
    "user_email",
    "host",
    "key_name",
    "value",
    "prev_value",
    "apply_result",
    "plugin_version"
   ],
   "cost_daily": [
    "day",
    "user_email",
    "provider",
    "model",
    "currency",
    "cost",
    "input_tokens",
    "output_tokens",
    "cache_read_tokens",
    "cache_write_tokens",
    "cached_input_tokens",
    "uncached_input_tokens",
    "source_file"
   ],
   "errors": [
    "event_id",
    "ts",
    "day",
    "user_email",
    "host",
    "hook_event",
    "plugin_version",
    "stage",
    "error_type"
   ]
  },
  "months": [
   {
    "month": "2025-08",
    "rows": {
     "events": 85,
     "policy_state": 48,
     "cost_daily": 40,
     "errors": 0
    },
    "csv_bytes_est": {
     "events": 17542,
     "policy_state": 6900,
     "cost_daily": 4821,
     "errors": 76
    },
    "zip_bytes_est": 7935
   },
   {
    "month": "2025-09",
    "rows": {
     "events": 1783,
     "policy_state": 960,
     "cost_daily": 237,
     "errors": 0
    },
    "csv_bytes_est": {
     "events": 363519,
     "policy_state": 136341,
     "cost_daily": 27760,
     "errors": 76
    },
    "zip_bytes_est": 142723
   },
   {
    "month": "2025-10",
    "rows": {
     "events": 2960,
     "policy_state": 1602,
     "cost_daily": 317,
     "errors": 0
    },
    "csv_bytes_est": {
     "events": 603339,
     "policy_state": 227460,
     "cost_daily": 37075,
     "errors": 76
    },
    "zip_bytes_est": 234749
   },
   {
    "month": "2025-11",
    "rows": {
     "events": 4131,
     "policy_state": 2250,
     "cost_daily": 380,
     "errors": 0
    },
    "csv_bytes_est": {
     "events": 841936,
     "policy_state": 319431,
     "cost_daily": 44411,
     "errors": 76
    },
    "zip_bytes_est": 326140
   },
   {
    "month": "2025-12",
    "rows": {
     "events": 6670,
     "policy_state": 3684,
     "cost_daily": 486,
     "errors": 0
    },
    "csv_bytes_est": {
     "events": 1359271,
     "policy_state": 522960,
     "cost_daily": 56754,
     "errors": 76
    },
    "zip_bytes_est": 524446
   },
   {
    "month": "2026-01",
    "rows": {
     "events": 7744,
     "policy_state": 4266,
     "cost_daily": 580,
     "errors": 0
    },
    "csv_bytes_est": {
     "events": 1578105,
     "policy_state": 605564,
     "cost_daily": 67699,
     "errors": 76
    },
    "zip_bytes_est": 608934
   },
   {
    "month": "2026-02",
    "rows": {
     "events": 7705,
     "policy_state": 4290,
     "cost_daily": 549,
     "errors": 0
    },
    "csv_bytes_est": {
     "events": 1570158,
     "policy_state": 608970,
     "cost_daily": 64090,
     "errors": 76
    },
    "zip_bytes_est": 606730
   },
   {
    "month": "2026-03",
    "rows": {
     "events": 9933,
     "policy_state": 5478,
     "cost_daily": 624,
     "errors": 0
    },
    "csv_bytes_est": {
     "events": 2024125,
     "policy_state": 777584,
     "cost_daily": 72823,
     "errors": 76
    },
    "zip_bytes_est": 777477
   },
   {
    "month": "2026-04",
    "rows": {
     "events": 9567,
     "policy_state": 5274,
     "cost_daily": 642,
     "errors": 0
    },
    "csv_bytes_est": {
     "events": 1949551,
     "policy_state": 748630,
     "cost_daily": 74919,
     "errors": 76
    },
    "zip_bytes_est": 750044
   },
   {
    "month": "2026-05",
    "rows": {
     "events": 10975,
     "policy_state": 5940,
     "cost_daily": 715,
     "errors": 0
    },
    "csv_bytes_est": {
     "events": 2236438,
     "policy_state": 843156,
     "cost_daily": 83419,
     "errors": 76
    },
    "zip_bytes_est": 855501
   },
   {
    "month": "2026-06",
    "rows": {
     "events": 12084,
     "policy_state": 6612,
     "cost_daily": 780,
     "errors": 0
    },
    "csv_bytes_est": {
     "events": 2462403,
     "policy_state": 938534,
     "cost_daily": 90988,
     "errors": 76
    },
    "zip_bytes_est": 944460
   },
   {
    "month": "2026-07",
    "rows": {
     "events": 14190,
     "policy_state": 7758,
     "cost_daily": 878,
     "errors": 0
    },
    "csv_bytes_est": {
     "events": 2891512,
     "policy_state": 1101187,
     "cost_daily": 102399,
     "errors": 76
    },
    "zip_bytes_est": 1107596
   },
   {
    "month": "2026-08",
    "rows": {
     "events": 16828,
     "policy_state": 9078,
     "cost_daily": 979,
     "errors": 0
    },
    "csv_bytes_est": {
     "events": 3429018,
     "policy_state": 1288535,
     "cost_daily": 114160,
     "errors": 76
    },
    "zip_bytes_est": 1306824
   },
   {
    "month": "2026-09",
    "rows": {
     "events": 15199,
     "policy_state": 8238,
     "cost_daily": 821,
     "errors": 44
    },
    "csv_bytes_est": {
     "events": 3097101,
     "policy_state": 1169313,
     "cost_daily": 95762,
     "errors": 5246
    },
    "zip_bytes_est": 1181229
   }
  ],
  "measured_month": "2026-08",
  "measured": {
   "csv_bytes": {
    "events": 3429379,
    "policy_state": 1287772,
    "cost_daily": 114071,
    "errors": 76
   },
   "zip_bytes": 1306691
  },
  "note": "measured_month は実際に書いて測った値（ZIP は deflate）。csv_bytes_est は全期間の 1 行あたりの大きさ×行数＋見出し、zip_bytes_est は measured_month の圧縮率で見積もった。最初と最後の月は途中まで"
 }
};
