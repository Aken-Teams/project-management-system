import { NextResponse } from 'next/server'

const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>Full Clip設備投資方案 - 測試截圖用</title>
<style>
  body { font-family: 'Microsoft JhengHei', Arial, sans-serif; margin: 40px; background: #fff; }
  h2 { color: #1f3864; font-size: 18px; margin-bottom: 4px; }
  .subtitle { color: #c00000; font-size: 13px; font-weight: bold; margin-bottom: 12px; }
  table { border-collapse: collapse; font-size: 12px; width: 860px; }
  th { background: #1f3864; color: #fff; padding: 5px 8px; text-align: center; border: 1px solid #aaa; }
  td { padding: 4px 8px; border: 1px solid #ccc; text-align: center; }
  tr:nth-child(even) td { background: #f2f2f2; }
  .total-row td { background: #ffc000 !important; font-weight: bold; }
  .note { color: #888; font-size: 11px; margin-top: 16px; }
  .left { text-align: left; }
  .right { text-align: right; }
  .highlight td { background: #fff2cc !important; font-weight: bold; }
</style>
</head>
<body>
<h2>● PDFN8080 腳架預估設計</h2>
<p class="subtitle">Full Clip設備投資方案(2)</p>
<table>
  <thead>
    <tr>
      <th rowspan="2">站別</th>
      <th rowspan="2">廠商</th>
      <th rowspan="2">設備機型/名稱</th>
      <th>組數</th>
      <th>產能K/M</th>
      <th>選購方式</th>
      <th>預估單價</th>
      <th>預估費用</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>DW</td><td class="left">新益昌</td><td class="left">焊接一貫機(網印&amp;貼膠)</td><td>1</td><td>3,200</td><td>新購</td><td class="right">8,500,000</td><td class="right">8,500,000</td></tr>
    <tr><td>DW</td><td class="left">邦壯</td><td class="left">腳架開模</td><td>1</td><td>—</td><td>新購</td><td class="right">1,200,000</td><td class="right">1,200,000</td></tr>
    <tr><td>DW</td><td class="left">邦壯</td><td class="left">跳線開模</td><td>1</td><td>—</td><td>新購</td><td class="right">800,000</td><td class="right">800,000</td></tr>
    <tr><td>DW</td><td class="left">數益</td><td class="left">焊接彈匣開模</td><td>1</td><td>—</td><td>新購</td><td class="right">600,000</td><td class="right">600,000</td></tr>
    <tr><td>MD</td><td class="left">數益</td><td class="left">焊接彈匣</td><td>160</td><td>—</td><td>新購</td><td class="right">45,000</td><td class="right">7,200,000</td></tr>
    <tr><td>MD</td><td class="left">星天科技</td><td class="left">電漿清潔機</td><td>1</td><td>3,552</td><td>新購</td><td class="right">3,800,000</td><td class="right">3,800,000</td></tr>
    <tr><td>MD</td><td class="left">TOWA</td><td class="left">一拖四</td><td>1</td><td>3,552</td><td>新購</td><td class="right">12,500,000</td><td class="right">12,500,000</td></tr>
    <tr><td>MD</td><td class="left">TOWA</td><td class="left">模具一副</td><td>1</td><td>—</td><td>新購</td><td class="right">4,200,000</td><td class="right">4,200,000</td></tr>
    <tr><td>MD</td><td class="left">數益</td><td class="left">成型彈匣</td><td>50</td><td>—</td><td>新購</td><td class="right">38,000</td><td class="right">1,900,000</td></tr>
    <tr><td>DG</td><td class="left">加達</td><td class="left">B080</td><td>1</td><td>3,552</td><td>新購</td><td class="right">18,000,000</td><td class="right">18,000,000</td></tr>
    <tr><td>TF</td><td class="left">浦見</td><td class="left">高速切筋成型系統</td><td>1</td><td>3,552</td><td>新購</td><td class="right">22,000,000</td><td class="right">22,000,000</td></tr>
    <tr><td>TMTT</td><td class="left">深科達</td><td class="left">SKD</td><td>1</td><td>3,552</td><td>新購</td><td class="right">9,500,000</td><td class="right">9,500,000</td></tr>
    <tr><td>TMTT</td><td class="left">冠魁</td><td class="left">測試機</td><td>1</td><td>3,552</td><td>新購</td><td class="right">6,773,545</td><td class="right">6,773,545</td></tr>
    <tr class="total-row"><td colspan="6" class="right">TOTAL</td><td></td><td class="right">96,973,545</td></tr>
    <tr class="highlight"><td colspan="7" class="right">預計投入 (NTD)</td><td class="right">96,973,545</td></tr>
  </tbody>
</table>
<p class="note">測試用表格 — 截圖後上傳至「投資設備清單 → AI 解析」。預期解析：13 筆，合計 NT$96,973,545</p>
</body>
</html>`

export async function GET() {
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
