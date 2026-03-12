import 'dotenv/config'
import { prisma } from '../lib/db'

// Sheet 1: PDFN8080 — milestones (1-digit: 1,2,3...), tasks (2-digit: 1.1,1.2...), subtasks (3-digit: 1.1.1,1.2.1...)
// Names and durations sourced from docs/PDFN8080開發里程碑與計劃表.xls (1 week = 7 days)
const PDFN8080_DATA = [
  { no: '1', name: '產品開發計劃', days: 35 },
  { no: '1.1', name: '新產品項目開發製造可行性分析', days: 21 },
  { no: '1.1.1', name: '產業分析', days: 14 },
  { no: '1.1.2', name: '利潤分析', days: 7 },
  { no: '1.2', name: '組建APQP多方論證小組', days: 7 },
  { no: '1.2.1', name: '確定初始製程流程圖', days: 7 },
  { no: '1.2.2', name: '確定產品特殊特性', days: 7 },
  { no: '1.2.3', name: '確定產品品質目標', days: 7 },
  { no: '1.2.4', name: '確定初始設備清單', days: 7 },
  { no: '2', name: '新產品設計和開發', days: 28 },
  { no: '2.1', name: '產品設計規則', days: 7 },
  { no: '2.2', name: '產品圖面設計', days: 7 },
  { no: '2.3', name: '產品規格', days: 7 },
  { no: '2.4', name: '確定材料需求和規格', days: 7 },
  { no: '2.5', name: '確定產品的特殊特性', days: 7 },
  { no: '3', name: '製程設計和開發 - I（產品原型）', days: 35 },
  { no: '3.1', name: '提供物料規格', days: 7 },
  { no: '3.2', name: '確定新產品製程設備需求和規格', days: 7 },
  { no: '3.3', name: '測量和試驗設備需求和規格', days: 7 },
  { no: '3.4', name: '製程設計', days: 14 },
  { no: '3.5', name: '確定製程的特殊特性', days: 7 },
  { no: '3.6', name: '製訂產品原型控制計劃', days: 7 },
  { no: '3.7', name: '製造工程圖檔開發', days: 7 },
  { no: '3.8', name: '產品原型製造', days: 7 },
  { no: '4', name: '製程設計和開發 - II（試產）', days: 161 },
  { no: '4.1', name: '製程特性分析', days: 42 },
  { no: '4.2', name: '製程設計準則', days: 42 },
  { no: '4.3', name: '生產作業SOP確認和更改', days: 42 },
  { no: '4.4', name: '進行量測系統分析評估', days: 42 },
  { no: '4.5', name: '新製程設備導入', days: 133 },
  { no: '4.5.1', name: '焊接一貫機設備導入', days: 63 },
  { no: '4.5.2', name: '電漿機設備導入', days: 63 },
  { no: '4.5.3', name: 'WB打線機設備導入', days: 63 },
  { no: '4.5.4', name: '電漿機設備導入(二)', days: 63 },
  { no: '4.5.5', name: '成型機設備導入', days: 63 },
  { no: '4.5.6', name: 'Laser去膠機設備導入', days: 63 },
  { no: '4.5.7', name: '電鍍委外代工方案導入', days: 63 },
  { no: '4.5.8', name: '電鍍條鍍自動線設備導入', days: 63 },
  { no: '4.5.9', name: '電鍍手動CD設備導入', days: 63 },
  { no: '4.5.10', name: '電鍍水刀機(新機)設備導入', days: 63 },
  { no: '4.5.11', name: '電鍍水刀機(改機)設備導入', days: 63 },
  { no: '4.5.12', name: '切腳機設備導入', days: 63 },
  { no: '4.5.13', name: 'TMTT handler機設備導入', days: 63 },
  { no: '4.5.14', name: 'TMTT tester機設備導入', days: 63 },
  { no: '4.6', name: '新測量和試驗設備導入', days: 21 },
  { no: '4.7', name: '製訂過程失效模式和效應分析', days: 28 },
  { no: '4.8', name: '製訂試產控制計劃', days: 7 },
  { no: '4.9', name: '進行信賴性測試', days: 56 },
  { no: '4.9.1', name: '信賴性測試 Hi-Rel 168hrs', days: 7 },
  { no: '4.9.2', name: '信賴性測試 Hi-Rel 500hrs', days: 21 },
  { no: '4.9.3', name: '信賴性測試 Hi-Rel 1000hrs', days: 56 },
  { no: '5', name: '產品與製程確認 - I（製程認證）', days: 28 },
  { no: '5.1', name: '客戶產品圖面規格確認', days: 7 },
  { no: '5.2', name: '製造認證', days: 7 },
  { no: '5.3', name: '預先量產過程失效模式和效應分析', days: 7 },
  { no: '5.4', name: '預先量產控制計畫', days: 7 },
  { no: '6', name: '產品與製程確認 - II（預先量產）', days: 161 },
  { no: '6.1', name: '新產品成本產能分析', days: 7 },
  { no: '6.2', name: '新製程之機台佈置及人力安排', days: 119 },
  { no: '6.2.1', name: '專案機台空間佈置', days: 91 },
  { no: '6.2.2', name: '專案機台水電氣需求配置', days: 56 },
  { no: '6.2.3', name: '專案人力安排', days: 56 },
  { no: '6.3', name: '預先量產生產作業計畫', days: 7 },
  { no: '6.4', name: '預先量產良率報告與改善計畫', days: 14 },
  { no: '6.5', name: '預先量產製程能力報告與改善計畫', days: 14 },
  { no: '6.6', name: '量產過程失效模式和效應分析', days: 7 },
  { no: '6.7', name: '量產控制計畫', days: 7 },
  { no: '7', name: '量產', days: 14 },
  { no: '7.1', name: '量產生產作業計畫', days: 7 },
  { no: '7.2', name: '量產良率報告與改善計畫', days: 7 },
  { no: '7.3', name: '量產製程能力報告與改善計畫', days: 7 },
]

// Sheet 2: APQP
// Names and durations sourced from docs/PDFN8080開發里程碑與計劃表.xls (1 week = 7 days)
const APQP_DATA = [
  { no: '1', name: '計劃和確定項目', days: 7 },
  { no: '1.1', name: '新產品開發申請表', days: 21 },
  { no: '1.2', name: '客戶圖面', days: 14 },
  { no: '1.3.1', name: '組織成員表', days: 7 },
  { no: '1.3.2', name: '相關資料收集', days: 21 },
  { no: '1.3.3', name: '法令及法規', days: 21 },
  { no: '1.3.4', name: '初期產品結構圖', days: 21 },
  { no: '1.3.5', name: '投資成本分析(含生產力估算與資源需求)', days: 7 },
  { no: '1.3.6', name: '專利申請及侵權確認表', days: 21 },
  { no: '1.3.7', name: '開發計劃表', days: 7 },
  { no: '1.3.7.1', name: '品質機能展開QFD', days: 14 },
  { no: '1.3.11', name: '產品開發可行性風險評估', days: 14 },
  { no: '1.4', name: '可靠性和品質目標', days: 14 },
  { no: '1.5.1', name: '初期供應商一覽表', days: 14 },
  { no: '1.5.2', name: '初期BOM及供應商', days: 14 },
  { no: '1.6', name: '生產流程(初期)', days: 14 },
  { no: '1.7', name: '計畫和確定項目-新產品開發核准書簽核', days: 14 },
  { no: '2', name: '產品設計和開發', days: 14 },
  { no: '2.1.1', name: '新產品開發製程有害物質污染鑑別與預防分析', days: 14 },
  { no: '2.1.2', name: '新產品HSF有害物質確認表', days: 14 },
  { no: '2.2', name: 'DFMEA分析表', days: 14 },
  { no: '2.3', name: '製作原型CP-製程原型品質計劃', days: 14 },
  { no: '2.3.1', name: '焊接一貫機 DA→PR→PO', days: 7 },
  { no: '2.3.2', name: 'WB打線機 DA→PR→PO', days: 7 },
  { no: '2.3.3', name: 'Pre-mold電漿機 DA→PR→PO', days: 7 },
  { no: '2.3.4', name: 'Towa成型機 DA→PR→PO', days: 7 },
  { no: '2.3.5', name: '電鍍委外代工 DA→PR→PO', days: 7 },
  { no: '2.3.6', name: '切腳機 DA→PR→PO', days: 7 },
  { no: '2.3.7', name: 'TMTT測試機 DA→PR→PO', days: 7 },
  { no: '2.3.8', name: '騰籠換鳥廠區移機計畫配合', days: 7 },
  { no: '2.4', name: '工程試作及設計驗證', days: 14 },
  { no: '2.4.1', name: '信賴性實驗報告', days: 84 },
  { no: '2.5', name: '設計審查-設計審查確認及記錄', days: 14 },
  { no: '2.6', name: '設計變更', days: 14 },
  { no: '2.7', name: '量具/試驗設備', days: 14 },
  { no: '3', name: '過程設計和開發', days: 14 },
  { no: '3.1', name: '生產流程圖(試量產)', days: 14 },
  { no: '3.2', name: '生產設備佈置圖', days: 14 },
  { no: '3.3', name: '製作PFMEA', days: 14 },
  { no: '3.4', name: '製作CP(試量產)', days: 14 },
  { no: '3.5', name: '製作OI(試量產)', days: 14 },
  { no: '3.6', name: 'MSA分析計劃', days: 14 },
  { no: '3.7', name: 'PPK研究計劃', days: 14 },
  { no: '3.8', name: '新產品試量產核准書', days: 14 },
  { no: '4', name: '產品和過程確認', days: 14 },
  { no: '4.1', name: '試量產-試量產報告', days: 14 },
  { no: '4.1.1', name: '試量產文件發行', days: 14 },
  { no: '4.1.2', name: '試量產實施', days: 14 },
  { no: '4.2', name: '設計變更', days: 14 },
  { no: '4.3', name: '量測系統評估-MSA報告', days: 14 },
  { no: '4.4', name: '初期PPK製程能力研究報告', days: 14 },
  { no: '4.5', name: '可靠度測試報告', days: 14 },
  { no: '4.6', name: '設計審查確認', days: 14 },
  { no: '4.7', name: '安全量產投放', days: 14 },
  { no: '4.7.1', name: 'Safe Launch', days: 14 },
  { no: '4.7.2', name: 'Safe Launch報告提出', days: 14 },
  { no: '4.8', name: 'CP及相關文件製作與發行', days: 14 },
  { no: '4.8.1', name: '製程品質計劃(量產)', days: 14 },
  { no: '4.8.2', name: '作業指導書(量產)', days: 14 },
  { no: '4.8.3', name: '生產流程圖(量產)', days: 14 },
  { no: '4.8.4', name: '原物料圖面', days: 14 },
  { no: '4.8.5', name: '合格承認書', days: 14 },
  { no: '4.9', name: 'PPAP報告', days: 14 },
  { no: '4.10', name: '新產品量產核准書', days: 14 },
  { no: '4.11', name: '樣品提供', days: 14 },
  { no: '4.12', name: '量產', days: 7 },
]

interface ParsedSubtask {
  title: string
  durationDays: number
  priority: 'medium'
}

interface ParsedTask {
  title: string
  durationDays: number
  priority: 'medium'
  subtasks: ParsedSubtask[]
}

interface ParsedMilestone {
  name: string
  durationDays: number
  tasks: ParsedTask[]
}

function parseData(data: { no: string; name: string; days: number }[]): ParsedMilestone[] {
  const milestones: ParsedMilestone[] = []

  for (const item of data) {
    const parts = item.no.split('.')
    // Prepend numbering to name/title (e.g. "1 產品開發計劃", "1.1 新產品項目開發製造可行性分析")
    const numberedName = `${item.no} ${item.name}`

    if (parts.length === 1) {
      // 1-digit = milestone (e.g. "1", "2")
      milestones.push({ name: numberedName, durationDays: item.days || 14, tasks: [] })
    } else if (parts.length === 2) {
      // 2-digit = task (e.g. "1.1", "1.2")
      const currentMilestone = milestones[milestones.length - 1]
      if (currentMilestone) {
        currentMilestone.tasks.push({
          title: numberedName,
          durationDays: item.days || 7,
          priority: 'medium',
          subtasks: [],
        })
      }
    } else {
      // 3+ digit = subtask (e.g. "1.1.1", "1.3.7.1")
      const currentMilestone = milestones[milestones.length - 1]
      const currentTask = currentMilestone?.tasks[currentMilestone.tasks.length - 1]
      if (currentTask) {
        currentTask.subtasks.push({
          title: numberedName,
          durationDays: item.days || 7,
          priority: 'medium',
        })
      }
    }
  }

  return milestones
}

async function seed() {
  const labelToData: { label: string; milestones: ParsedMilestone[] }[] = [
    { label: 'PDFN8080', milestones: parseData(PDFN8080_DATA) },
    { label: 'APQP', milestones: parseData(APQP_DATA) },
  ]

  for (const { label, milestones } of labelToData) {
    // Look up the actual DB key by label from ProjectTypeConfig
    const ptConfig = await prisma.projectTypeConfig.findFirst({ where: { label } })
    if (!ptConfig) {
      console.log(`\n--- ${label}: project type not found in DB, skipping ---`)
      continue
    }
    const projectType = ptConfig.key
    console.log(`\n--- ${label} (key=${projectType}): ${milestones.length} milestones ---`)

    // Delete existing
    await prisma.milestoneTemplateConfig.deleteMany({ where: { projectType } })

    for (let i = 0; i < milestones.length; i++) {
      const ms = milestones[i]
      const created = await prisma.milestoneTemplateConfig.create({
        data: {
          projectType,
          name: ms.name,
          durationDays: ms.durationDays,
          sortOrder: i,
        },
      })
      const subtaskTotal = ms.tasks.reduce((sum, t) => sum + t.subtasks.length, 0)
      console.log(`  [${i}] ${ms.name} (${ms.tasks.length} tasks, ${subtaskTotal} subtasks)`)

      for (let j = 0; j < ms.tasks.length; j++) {
        const task = ms.tasks[j]
        const createdTask = await prisma.milestoneTemplateTask.create({
          data: {
            milestoneTemplateId: created.id,
            title: task.title,
            durationDays: task.durationDays,
            priority: task.priority,
            sortOrder: j,
          },
        })

        if (task.subtasks.length > 0) {
          await prisma.milestoneTemplateTask.createMany({
            data: task.subtasks.map((st, k) => ({
              milestoneTemplateId: created.id,
              parentId: createdTask.id,
              title: st.title,
              durationDays: st.durationDays,
              priority: st.priority,
              sortOrder: k,
            })),
          })
        }
      }
    }
  }

  // Clean up old data seeded with wrong keys (label as key)
  const orphaned = await prisma.milestoneTemplateConfig.findMany({
    where: { projectType: { in: ['PDFN8080', 'APQP'] } },
    select: { id: true },
  })
  if (orphaned.length > 0) {
    await prisma.milestoneTemplateConfig.deleteMany({
      where: { projectType: { in: ['PDFN8080', 'APQP'] } },
    })
    console.log(`\nCleaned up ${orphaned.length} orphaned rows with wrong keys`)
  }

  console.log('\nDone!')
}

seed()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
