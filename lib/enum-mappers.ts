/**
 * Enum value mapping between frontend (hyphen-case) and database (underscore_case).
 *
 * PostgreSQL enums do not support hyphens, so DB values use underscores.
 * Frontend types use hyphens for consistency with existing code.
 */

// ─── Generic converters ─────────────────────────────────

/** Convert frontend hyphen-case to DB underscore_case */
export function toDbEnum<T extends string>(value: string): T {
  return value.replace(/-/g, '_') as T
}

/** Convert DB underscore_case to frontend hyphen-case */
export function toFrontendEnum<T extends string>(value: string): T {
  return value.replace(/_/g, '-') as T
}

// ─── Specific type-safe mappers ─────────────────────────

// TaskStatus: 'in-progress' ↔ 'in_progress'
import type { TaskStatus as DbTaskStatus } from '@prisma/client'
import type { TaskStatus as FeTaskStatus } from './mock-data'

export function taskStatusToDb(status: FeTaskStatus): DbTaskStatus {
  return toDbEnum<DbTaskStatus>(status)
}

export function taskStatusToFe(status: DbTaskStatus): FeTaskStatus {
  return toFrontendEnum<FeTaskStatus>(status)
}

// ProjectType: 'cost-optimization' ↔ 'cost_optimization'
import type { ProjectType as DbProjectType } from '@prisma/client'
import type { ProjectType as FeProjectType } from './mock-data'

export function projectTypeToDb(type: FeProjectType): DbProjectType {
  return toDbEnum<DbProjectType>(type)
}

export function projectTypeToFe(type: DbProjectType): FeProjectType {
  return toFrontendEnum<FeProjectType>(type)
}

// WeeklyUpdateStatus: 'on-time' ↔ 'on_time'
import type { WeeklyUpdateStatus as DbWeeklyStatus } from '@prisma/client'

type FeWeeklyStatus = 'on-time' | 'delay'

export function weeklyStatusToDb(status: FeWeeklyStatus): DbWeeklyStatus {
  return toDbEnum<DbWeeklyStatus>(status)
}

export function weeklyStatusToFe(status: DbWeeklyStatus): FeWeeklyStatus {
  return toFrontendEnum<FeWeeklyStatus>(status)
}

// NotificationType: 'task-assigned' ↔ 'task_assigned'
import type { NotificationType as DbNotifType } from '@prisma/client'
import type { NotificationType as FeNotifType } from './notification-store'

export function notifTypeToDb(type: FeNotifType): DbNotifType {
  return toDbEnum<DbNotifType>(type)
}

export function notifTypeToFe(type: DbNotifType): FeNotifType {
  return toFrontendEnum<FeNotifType>(type)
}

// DelayRequestStatus: no hyphens — same in both, but keep mapper for consistency
import type { DelayRequestStatus as DbDelayStatus } from '@prisma/client'

type FeDelayStatus = 'pending' | 'approved' | 'rejected'

export function delayStatusToDb(status: FeDelayStatus): DbDelayStatus {
  return status as DbDelayStatus
}

export function delayStatusToFe(status: DbDelayStatus): FeDelayStatus {
  return status as FeDelayStatus
}

// ProjectTier: T1/T2/T3/CIP — same in both, no conversion needed
import type { ProjectTier as DbProjectTier } from '@prisma/client'
import type { ProjectTier as FeProjectTier } from './mock-data'

export function projectTierToDb(tier: FeProjectTier): DbProjectTier {
  return tier as DbProjectTier
}

export function projectTierToFe(tier: DbProjectTier): FeProjectTier {
  return tier as FeProjectTier
}

// DemandSource: 'company-policy' ↔ 'company_policy'
import type { DemandSource as DbDemandSource } from '@prisma/client'
import type { DemandSource as FeDemandSource } from './mock-data'

export function demandSourceToDb(source: FeDemandSource): DbDemandSource {
  return toDbEnum<DbDemandSource>(source)
}

export function demandSourceToFe(source: DbDemandSource): FeDemandSource {
  return toFrontendEnum<FeDemandSource>(source)
}
