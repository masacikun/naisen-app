#!/usr/bin/env python3
"""
ナイセンクラウド CDR CSV → Supabase インポートスクリプト
使い方:
  python scripts/import_cdr.py /path/to/csvフォルダ
"""
import sys, os, glob
import pandas as pd
from supabase import create_client
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

SUPABASE_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

LINE_NAMES = {
    '05053708216': 'クリマバイト',
    '05053708217': 'スタッフ中洲',
    '05053708218': '求人中洲',
    '05053708220': 'online_order',
    '05053711020': 'SmileEstate',
    '05053711021': '本社FAX',
    '05053711025': '水炊き・もつ鍋',
    '05053711026': '西新',
    '05053711030': 'Central',
    '05053711034': 'GACHA',
    '05054344449': 'CoSmile',
    '05054344450': 'SmileFood',
    '05054344451': 'gates',
    '05054344452': 'tenjin',
    '0922923010':  '1_gates',
}

def extract_line_info(destination):
    if not destination or pd.isna(destination):
        return None, None
    dest = str(destination).strip()
    if '/' in dest:
        num, name = dest.split('/', 1)
        num = num.strip()
        canonical = LINE_NAMES.get(num, name.strip())
        return num, canonical
    return dest, LINE_NAMES.get(dest)

def parse_file(filepath):
    for enc in ['cp932', 'shift-jis', 'utf-8-sig', 'utf-8']:
        try:
            df = pd.read_csv(filepath, encoding=enc)
            df['source_file'] = os.path.basename(filepath)
            return df
        except Exception:
            continue
    print(f"  ⚠️  読み込み失敗: {filepath}")
    return pd.DataFrame()

def transform(df):
    records = []
    for _, row in df.iterrows():
        line_num, line_name = extract_line_info(row.get('発信先'))
        outbound = str(row.get('発信外線', '') or '')
        if not line_num and outbound and '/' in outbound:
            line_num, line_name = extract_line_info(outbound)
        call_id = str(row.get('通話ID', '') or '').strip()
        if not call_id:
            continue
        def to_ts(val):
            if pd.isna(val) or not val: return None
            try:
                ts = pd.Timestamp(val)
                if ts.tzinfo is None:
                    ts = ts.tz_localize('Asia/Tokyo')
                return ts.isoformat()
            except: return None
        records.append({
            'started_at':       to_ts(row.get('開始日時')),
            'ended_at':         to_ts(row.get('終了日時')),
            'duration_sec':     int(row.get('接続秒数', 0) or 0),
            'caller':           str(row.get('発信元', '') or '').strip() or None,
            'caller_name':      str(row.get('発信元名', '') or '').strip() or None,
            'destination':      str(row.get('発信先', '') or '').strip() or None,
            'destination_name': str(row.get('発信先名', '') or '').strip() or None,
            'line_number':      line_num,
            'line_name':        line_name,
            'ivr_route':        str(row.get('応答機能', '') or '').strip() or None,
            'answered_ext':     str(row.get('応答内線', '') or '').strip() or None,
            'outbound_line':    outbound.strip() or None,
            'transferred':      str(row.get('転送', '') or '').strip() or None,
            'park_number':      str(row.get('パーク番号', '') or '').strip() or None,
            'status':           str(row.get('ステータス', '') or '').strip() or None,
            'memo':             str(row.get('メモ', '') or '').strip() or None,
            'comm_id':          str(row.get('通信ID', '') or '').strip() or None,
            'call_id':          call_id,
            'callback_id':      str(row.get('コールバックID', '') or '').strip() or None,
            'source_file':      row.get('source_file'),
        })
    return records

def upsert_records(records):
    seen = {}
    for r in records:
        seen[r['call_id']] = r
    deduped = list(seen.values())
    BATCH = 500
    total = 0
    for i in range(0, len(deduped), BATCH):
        supabase.table('naisen_calls').upsert(deduped[i:i+BATCH], on_conflict='call_id').execute()
        total += len(deduped[i:i+BATCH])
    return total

def main():
    csv_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'csv')
    files = sorted(glob.glob(os.path.join(csv_dir, 'cdr*.csv')))
    if not files:
        print(f"CSVファイルが見つかりません: {csv_dir}")
        sys.exit(1)
    print(f"=== ナイセンクラウド CDR インポート ===")
    print(f"対象: {csv_dir}  ({len(files)}ファイル)\n")
    total = 0
    for f in files:
        print(f"📄 {os.path.basename(f)}", end=' ... ', flush=True)
        df = parse_file(f)
        if df.empty: continue
        n = upsert_records(transform(df))
        total += n
        print(f"{n}件")
    print(f"\n✅ 完了: 合計 {total} 件")

if __name__ == '__main__':
    main()
