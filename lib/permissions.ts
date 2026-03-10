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
        canViewBudget: false,
        canEditBudget: false,
        canManageTeam: false,
        canViewAllProjects: false,
        canExportReports: false,
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
  // Admin, PM 和主管可以看所有專案
  if (userRole === 'admin' || userRole === 'pm' || userRole === 'executive') {
    return true
  }

  // 一般成員只能看自己參與的專案
  if (userRole === 'member') {
    return project.team.includes(userName) || project.owner === userName
  }

  return false
}

export function isAdmin(user: { role: string } | null): boolean {
  return user?.role === 'admin'
}
