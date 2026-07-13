// CDR集約・81アダプタの単体テスト（合成データのみ）
import { describe, it, expect } from 'vitest'
import { to0Form, aggregateCdr, type CdrLeg } from './cdr-transform'

const leg = (over: Partial<CdrLeg>): CdrLeg => ({
  calldate: '2026-07-20 10:00:00', src: '09012345678', dst: '05053711017',
  dcontext: 'from-pstn-toheader', channel: 'PJSIP/Rakuten-017-00000001',
  dstchannel: '', lastapp: 'Dial', duration: 30, billsec: 0,
  disposition: 'NO ANSWER', uniqueid: '1752980400.1', did: '815053711017',
  recordingfile: '', cnam: '', outbound_cnum: '', linkedid: '1752980400.1', sequence: 1,
  ...over,
})

describe('to0Form（81形式アダプタ）', () => {
  it('先頭81・12桁以上は0付替え', () => {
    expect(to0Form('815053711017')).toBe('05053711017')
    expect(to0Form('819012345678')).toBe('09012345678')
  })
  it('0始まり・11桁以下は不変', () => {
    expect(to0Form('05053711017')).toBe('05053711017')
    expect(to0Form('0312345678')).toBe('0312345678')
    expect(to0Form('81901234567')).toBe('81901234567') // 11桁は対象外
  })
  it('非数字除去・空/anonymousは空文字', () => {
    expect(to0Form('81-50-5371-1017')).toBe('05053711017')
    expect(to0Form('anonymous')).toBe('')
    expect(to0Form(null)).toBe('')
  })
})

describe('aggregateCdr', () => {
  it('着信・内線応答: ANSWERED・answered_ext・duration=応答billsec最大・回線名(81形式DID→大和A)', () => {
    const rows = aggregateCdr([
      leg({ sequence: 1, disposition: 'ANSWERED', dstchannel: 'Local/ivr-4@ivr-4-0001;1', billsec: 8 }),
      leg({ sequence: 2, uniqueid: '1752980400.2', disposition: 'ANSWERED',
            dstchannel: 'PJSIP/7005-00000002', billsec: 42,
            recordingfile: 'q-2026-external.wav' }),
    ])
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.status).toBe('ANSWERED')
    expect(r.answered_ext).toBe('7005')
    expect(r.duration_sec).toBe(42)
    expect(r.caller).toBe('09012345678')
    expect(r.line_number).toBe('05053711017')
    expect(r.line_name).toBe('大和A')
    expect(r.destination).toBe('05053711017/大和A')
    expect(r.call_id).toBe('1752980400.1')
    expect(r.recording_file).toBe('q-2026-external.wav')
    expect(r.started_at).toBe('2026-07-20T01:00:00.000Z') // JST 10:00 = UTC 01:00
  })

  it('IVRのみ応答（内線に人間の応答なし）→ NO ANSWER・duration 0', () => {
    const rows = aggregateCdr([
      leg({ disposition: 'ANSWERED', dstchannel: 'Local/ivr-4@ivr-4-0001;1', billsec: 15 }),
    ])
    expect(rows[0].status).toBe('NO ANSWER')
    expect(rows[0].duration_sec).toBe(0)
    expect(rows[0].answered_ext).toBeNull()
    expect(rows[0].ivr_route).toBeNull()
  })

  it('ivr_route は ivr-N コンテキストから取得', () => {
    const rows = aggregateCdr([
      leg({ disposition: 'ANSWERED', dst: 's', dcontext: 'ivr-4', dstchannel: '' }),
    ])
    expect(rows[0].ivr_route).toBe('ivr-4')
  })

  it('BUSY は IVR応答より優先', () => {
    const rows = aggregateCdr([
      leg({ sequence: 1, disposition: 'ANSWERED', dstchannel: 'Local/ivr-4@x;1' }),
      leg({ sequence: 2, uniqueid: '.2', disposition: 'BUSY' }),
    ])
    expect(rows[0].status).toBe('BUSY')
  })

  it('発信: caller=発信内線・destination=81アダプタ済み相手番号・outbound_line', () => {
    const rows = aggregateCdr([
      leg({
        dcontext: 'from-internal', channel: 'PJSIP/7005-00000003',
        src: '7005', dst: '819011112222', did: '',
        disposition: 'ANSWERED', dstchannel: 'PJSIP/Rakuten-017-00000004',
        billsec: 60, outbound_cnum: '815053711017',
      }),
    ])
    const r = rows[0]
    expect(r.status).toBe('ANSWERED')
    expect(r.caller).toBe('7005')
    expect(r.destination).toBe('09011112222')
    expect(r.duration_sec).toBe(60)
    expect(r.answered_ext).toBe('7005')
    expect(r.outbound_line).toBe('05053711017/大和A')
    expect(r.line_name).toBeNull()
  })

  it('内線通話も保持（internal）', () => {
    const rows = aggregateCdr([
      leg({
        dcontext: 'from-internal', channel: 'PJSIP/7005-00000005',
        src: '7005', dst: '7006', did: '',
        disposition: 'ANSWERED', dstchannel: 'PJSIP/7006-00000006', billsec: 10,
      }),
    ])
    expect(rows[0].caller).toBe('7005')
    expect(rows[0].destination).toBe('7006')
    expect(rows[0].status).toBe('ANSWERED')
    expect(rows[0].answered_ext).toBe('7006')
  })

  it('非通知(anonymous)は原文保持', () => {
    const rows = aggregateCdr([leg({ src: 'anonymous' })])
    expect(rows[0].caller).toBe('anonymous')
  })

  it('冪等性: 同一入力→同一出力・call_id は linkedid 単位で一意（UPSERTキー）', () => {
    const input = [
      leg({ sequence: 1 }),
      leg({ sequence: 2, uniqueid: '.2', dstchannel: 'PJSIP/7005-1', disposition: 'ANSWERED', billsec: 5 }),
      leg({ linkedid: 'L2', uniqueid: 'L2.1' }),
    ]
    const a = aggregateCdr(input)
    const b = aggregateCdr(input)
    expect(a).toEqual(b)
    expect(new Set(a.map(r => r.call_id)).size).toBe(a.length)
    expect(a).toHaveLength(2)
  })

  it('linkedid 空のレグは捨てる', () => {
    expect(aggregateCdr([leg({ linkedid: '' })])).toHaveLength(0)
  })
})
