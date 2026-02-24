import type { ProjectType } from './mock-data'

export interface MilestoneTemplate {
  name: string
  durationDays: number
}

export const MILESTONE_TEMPLATES: Record<ProjectType, MilestoneTemplate[]> = {
  'npi': [
    { name: '需求分析與可行性評估', durationDays: 14 },
    { name: '概念設計', durationDays: 21 },
    { name: '詳細設計與開發', durationDays: 28 },
    { name: '原型製作與驗證', durationDays: 21 },
    { name: '試產', durationDays: 21 },
    { name: '量產導入', durationDays: 14 },
  ],
  'cost-optimization': [
    { name: '現況分析與成本拆解', durationDays: 14 },
    { name: '優化方案擬定', durationDays: 14 },
    { name: '供應商談判/方案執行', durationDays: 21 },
    { name: '驗證與效果評估', durationDays: 14 },
    { name: '標準化與持續追蹤', durationDays: 7 },
  ],
  'quality-improvement': [
    { name: '問題分析與根因調查', durationDays: 14 },
    { name: '改善方案制定', durationDays: 14 },
    { name: '改善措施實施', durationDays: 21 },
    { name: '驗證與成效確認', durationDays: 14 },
    { name: '標準化與文件更新', durationDays: 7 },
  ],
  'automation': [
    { name: '現況流程分析', durationDays: 14 },
    { name: '自動化方案設計', durationDays: 21 },
    { name: '設備/系統開發', durationDays: 28 },
    { name: '測試與調試', durationDays: 14 },
    { name: '上線與人員培訓', durationDays: 14 },
  ],
  'product-strategy': [
    { name: '市場調查與分析', durationDays: 21 },
    { name: '策略方向確認', durationDays: 14 },
    { name: '執行計畫制定', durationDays: 14 },
    { name: '策略執行', durationDays: 28 },
    { name: '成效評估與調整', durationDays: 14 },
  ],
  'process-optimization': [
    { name: '製程現況分析', durationDays: 14 },
    { name: '瓶頸識別與方案設計', durationDays: 14 },
    { name: '改善實施', durationDays: 21 },
    { name: '製程驗證', durationDays: 14 },
    { name: '標準化與推廣', durationDays: 7 },
  ],
  'external-requirement': [
    { name: '需求確認與影響評估', durationDays: 14 },
    { name: '方案規劃', durationDays: 14 },
    { name: '執行與導入', durationDays: 21 },
    { name: '測試與驗證', durationDays: 14 },
    { name: '結案與交付', durationDays: 7 },
  ],
}
