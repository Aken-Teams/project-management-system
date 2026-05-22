import type { UserRole } from './auth-context'

export interface Permission {
  canCreateProject: boolean
  canEditProject: boolean
  canDeleteProject: boolean
  canViewBudget: boolean
  canEditBudget: boolean
  canManageTeam: boolean
  canViewAllProjects: boolean
  canExportReports: boolean
  canManageRisks: boolean
  canViewGantt: boolean
}

export function getRolePermissions(role: UserRole | undefined | null): Permission {
  switch (role) {
    case 'pm':
      return {
        canCreateProject: true,
        canEditProject: true,
        canDeleteProject: true,
        canViewBudget: true,
        canEditBudget: true,
        canManageTeam: true,
        canViewAllProjects: true,
        canExportReports: true,
        canManageRisks: true,
        canViewGantt: true,
      }
    case 'executive':
      return {
        canCreateProject: false,
        canEditProject: false,
        canDeleteProject: false,
        canViewBudget: true,
        canEditBudget: false,
        canManageTeam: false,
        canViewAllProjects: true,
        canExportReports: true,
        canManageRisks: false,
        canViewGantt: true,
      }
    case 'admin':
      return {
        canCreateProject: true,
        canEditProject: true,
        canDeleteProject: true,
        canViewBudget: true,
        canEditBudget: true,
        canManageTeam: true,
        canViewAllProjects: true,
        canExportReports: true,
        canManageRisks: true,
        canViewGantt: true,
      }
    case 'member':
      return {
        canCreateProject: false,
        canEditProject: false,
        canDeleteProject: false,
        canViewBudget: true,
        canEditBudget: false,
        canManageTeam: false,
        canViewAllProjects: true,
        canExportReports: true,
        canManageRisks: false,
        canViewGantt: true,
      }
    default:
      return {
        canCreateProject: false,
        canEditProject: false,
        canDeleteProject: false,
        canViewBudget: false,
        canEditBudget: false,
        canManageTeam: false,
        canViewAllProjects: false,
        canExportReports: false,
        canManageRisks: false,
        canViewGantt: false,
      }
  }
}

export function canUserAccessProject(
  userId: string,
  userName: string,
  userRole: UserRole,
  project: { team: string[]; owner: string }
): boolean {
  // 所有角色都能看到所有專案（細部權限由專案角色 RACIPS 控制）
  return true
}

export function isAdmin(user: { role: string } | null): boolean {
  return user?.role === 'admin'
}
