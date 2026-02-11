import type { ProjectType } from './mock-data'

export interface MilestoneTemplate {
  name: string
  durationWeeks: number
}

export const MILESTONE_TEMPLATES: Record<ProjectType, MilestoneTemplate[]> = {
  'npi': [
    { name: '需求分析與可行性評估', durationWeeks: 2 },
    { name: '概念設計', durationWeeks: 3 },
    { name: '詳細設計與開發', durationWeeks: 4 },
    { name: '原型製作與驗證', durationWeeks: 3 },
    { name: '試產', durationWeeks: 3 },
    { name: '量產導入', durationWeeks: 2 },
  ],
  'cost-optimization': [
    { name: '現況分析與成本拆解', durationWeeks: 2 },
    { name: '優化方案擬定', durationWeeks: 2 },
    { name: '供應商談判/方案執行', durationWeeks: 3 },
    { name: '驗證與效果評估', durationWeeks: 2 },
    { name: '標準化與持續追蹤', durationWeeks: 1 },
  ],
  'quality-improvement': [
    { name: '問題分析與根因調查', durationWeeks: 2 },
    { name: '改善方案制定', durationWeeks: 2 },
    { name: '改善措施實施', durationWeeks: 3 },
    { name: '驗證與成效確認', durationWeeks: 2 },
    { name: '標準化與文件更新', durationWeeks: 1 },
  ],
  'automation': [
    { name: '現況流程分析', durationWeeks: 2 },
    { name: '自動化方案設計', durationWeeks: 3 },
    { name: '設備/系統開發', durationWeeks: 4 },
    { name: '測試與調試', durationWeeks: 2 },
    { name: '上線與人員培訓', durationWeeks: 2 },
  ],
  'product-strategy': [
    { name: '市場調查與分析', durationWeeks: 3 },
    { name: '策略方向確認', durationWeeks: 2 },
    { name: '執行計畫制定', durationWeeks: 2 },
    { name: '策略執行', durationWeeks: 4 },
    { name: '成效評估與調整', durationWeeks: 2 },
  ],
  'process-optimization': [
    { name: '製程現況分析', durationWeeks: 2 },
    { name: '瓶頸識別與方案設計', durationWeeks: 2 },
    { name: '改善實施', durationWeeks: 3 },
    { name: '製程驗證', durationWeeks: 2 },
    { name: '標準化與推廣', durationWeeks: 1 },
  ],
  'external-requirement': [
    { name: '需求確認與影響評估', durationWeeks: 2 },
    { name: '方案規劃', durationWeeks: 2 },
    { name: '執行與導入', durationWeeks: 3 },
    { name: '測試與驗證', durationWeeks: 2 },
    { name: '結案與交付', durationWeeks: 1 },
  ],
}
