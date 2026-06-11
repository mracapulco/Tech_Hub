import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import { AdfsService } from './adfs.service';

@Controller('adfs')
export class AdfsController {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly svc: AdfsService) {}

  private getTokenFromHeader(auth?: string): string | null {
    if (!auth) return null;
    const parts = auth.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') return parts[1];
    return null;
  }

  private async getContext(authorization?: string) {
    const token = this.getTokenFromHeader(authorization);
    if (!token) return { ok: false, error: 'Unauthorized' } as const;
    try {
      const payload: any = this.jwt.verify(token, { secret: process.env.JWT_SECRET || 'dev-secret' });
      const userId: string | null = payload?.sub ?? null;
      if (!userId) return { ok: false, error: 'Invalid token' } as const;
      const memberships = await this.prisma.userCompanyMembership.findMany({ where: { userId }, select: { companyId: true, role: true } });
      const isAdmin = memberships.some((m: any) => m.role === 'ADMIN');
      const isTechnician = memberships.some((m: any) => m.role === 'TECHNICIAN');
      const isClient = memberships.some((m: any) => m.role === 'CLIENT');
      const allowedCompanyIds = memberships.map((m: any) => m.companyId);
      return { ok: true, isAdmin, isTechnician, isClient, allowedCompanyIds } as const;
    } catch {
      return { ok: false, error: 'Invalid token' } as const;
    }
  }

  private async canAccessProject(projectId: string, ctx: { isAdmin: boolean; isTechnician: boolean; allowedCompanyIds: string[] }) {
    const project = await this.prisma.adFsProject.findUnique({ where: { id: projectId }, select: { companyId: true } });
    if (!project) return { ok: false, error: 'Projeto não encontrado' } as const;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(project.companyId)) return { ok: false, error: 'Forbidden' } as const;
    return { ok: true, companyId: project.companyId } as const;
  }

  @Get('projects')
  async projects(@Query('companyId') companyId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    const data = await this.svc.listProjects(companyId);
    return { ok: true, data };
  }

  @Post('projects')
  async createProject(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    const companyId = String(body?.companyId || '');
    if (!companyId) return { ok: false, error: 'companyId obrigatório' };
    const data = await this.svc.createProject({
      companyId,
      name: String(body?.name || ''),
      description: body?.description,
      domainName: body?.domainName,
      rootOuName: body?.rootOuName,
      rootPath: body?.rootPath,
      userHomeDriveLetter: body?.userHomeDriveLetter,
      userHomeLocalRoot: body?.userHomeLocalRoot,
      userHomeShareRoot: body?.userHomeShareRoot,
    });
    return { ok: true, data };
  }

  @Get('projects/:id')
  async detail(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    const access = await this.canAccessProject(id, ctx);
    if (!access.ok) return access;
    const data = await this.svc.getProject(id);
    return { ok: true, data };
  }

  @Put('projects/:id')
  async updateProject(@Param('id') id: string, @Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    const access = await this.canAccessProject(id, ctx);
    if (!access.ok) return access;
    const data = await this.svc.updateProject(id, body);
    return { ok: true, data };
  }

  @Delete('projects/:id')
  async deleteProject(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    const access = await this.canAccessProject(id, ctx);
    if (!access.ok) return access;
    const data = await this.svc.deleteProject(id);
    return { ok: true, data };
  }

  @Post('org-nodes')
  async createOrgNode(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician || ctx.isClient)) return { ok: false, error: 'Forbidden' };
    const access = await this.canAccessProject(String(body?.projectId || ''), ctx);
    if (!access.ok) return access;
    const data = await this.svc.createOrgNode(body);
    return { ok: true, data };
  }

  @Get('org-nodes')
  async orgNodes(@Query('projectId') projectId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    const access = await this.canAccessProject(projectId, ctx);
    if (!access.ok) return access;
    const data = await this.svc.listOrgNodes(projectId);
    return { ok: true, data };
  }

  @Put('org-nodes/:id')
  async updateOrgNode(@Param('id') id: string, @Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician || ctx.isClient)) return { ok: false, error: 'Forbidden' };
    const node = await this.prisma.adFsOrgNode.findUnique({ where: { id }, select: { projectId: true } });
    if (!node) return { ok: false, error: 'Item não encontrado' };
    const access = await this.canAccessProject(node.projectId, ctx);
    if (!access.ok) return access;
    const data = await this.svc.updateOrgNode(id, body);
    return { ok: true, data };
  }

  @Delete('org-nodes/:id')
  async deleteOrgNode(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician || ctx.isClient)) return { ok: false, error: 'Forbidden' };
    const node = await this.prisma.adFsOrgNode.findUnique({ where: { id }, select: { projectId: true } });
    if (!node) return { ok: false, error: 'Item não encontrado' };
    const access = await this.canAccessProject(node.projectId, ctx);
    if (!access.ok) return access;
    try {
      const data = await this.svc.deleteOrgNode(id);
      return { ok: true, data };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Falha ao excluir item' };
    }
  }

  @Post('ou-nodes')
  async createOuNode(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    const access = await this.canAccessProject(String(body?.projectId || ''), ctx);
    if (!access.ok) return access;
    const data = await this.svc.createOuNode(body);
    return { ok: true, data };
  }

  @Get('ou-nodes')
  async ouNodes(@Query('projectId') projectId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    const access = await this.canAccessProject(projectId, ctx);
    if (!access.ok) return access;
    const data = await this.svc.listOuNodes(projectId);
    return { ok: true, data };
  }

  @Post('groups')
  async createGroup(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician || ctx.isClient)) return { ok: false, error: 'Forbidden' };
    const access = await this.canAccessProject(String(body?.projectId || ''), ctx);
    if (!access.ok) return access;
    const data = await this.svc.createGroup(body);
    return { ok: true, data };
  }

  @Get('groups')
  async groups(@Query('projectId') projectId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    const access = await this.canAccessProject(projectId, ctx);
    if (!access.ok) return access;
    const data = await this.svc.listGroups(projectId);
    return { ok: true, data };
  }

  @Put('groups/:id')
  async updateGroup(@Param('id') id: string, @Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician || ctx.isClient)) return { ok: false, error: 'Forbidden' };
    const group = await this.prisma.adFsGroup.findUnique({ where: { id }, select: { projectId: true } });
    if (!group) return { ok: false, error: 'Grupo não encontrado' };
    const access = await this.canAccessProject(group.projectId, ctx);
    if (!access.ok) return access;
    const data = await this.svc.updateGroup(id, body);
    return { ok: true, data };
  }

  @Get('groups/:id/dependencies')
  async groupDependencies(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    const group = await this.prisma.adFsGroup.findUnique({ where: { id }, select: { projectId: true } });
    if (!group) return { ok: false, error: 'Grupo não encontrado' };
    const access = await this.canAccessProject(group.projectId, ctx);
    if (!access.ok) return access;
    const data = await this.svc.getGroupDependencies(id);
    return { ok: true, data };
  }

  @Delete('groups/:id')
  async deleteGroup(@Param('id') id: string, @Query('force') force: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician || ctx.isClient)) return { ok: false, error: 'Forbidden' };
    const group = await this.prisma.adFsGroup.findUnique({ where: { id }, select: { projectId: true } });
    if (!group) return { ok: false, error: 'Grupo não encontrado' };
    const access = await this.canAccessProject(group.projectId, ctx);
    if (!access.ok) return access;
    try {
      const data = await this.svc.deleteGroup(id, force === 'true');
      return { ok: true, data };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Falha ao excluir grupo' };
    }
  }

  @Post('users')
  async createUser(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician || ctx.isClient)) return { ok: false, error: 'Forbidden' };
    const access = await this.canAccessProject(String(body?.projectId || ''), ctx);
    if (!access.ok) return access;
    const data = await this.svc.createUser(body);
    return { ok: true, data };
  }

  @Get('users')
  async users(@Query('projectId') projectId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    const access = await this.canAccessProject(projectId, ctx);
    if (!access.ok) return access;
    const data = await this.svc.listUsers(projectId);
    return { ok: true, data };
  }

  @Put('users/:id')
  async updateUser(@Param('id') id: string, @Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician || ctx.isClient)) return { ok: false, error: 'Forbidden' };
    const user = await this.prisma.adFsUserPlan.findUnique({ where: { id }, select: { projectId: true } });
    if (!user) return { ok: false, error: 'Usuário não encontrado' };
    const access = await this.canAccessProject(user.projectId, ctx);
    if (!access.ok) return access;
    const data = await this.svc.updateUser(id, body);
    return { ok: true, data };
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician || ctx.isClient)) return { ok: false, error: 'Forbidden' };
    const user = await this.prisma.adFsUserPlan.findUnique({ where: { id }, select: { projectId: true } });
    if (!user) return { ok: false, error: 'Usuário não encontrado' };
    const access = await this.canAccessProject(user.projectId, ctx);
    if (!access.ok) return access;
    const data = await this.svc.deleteUser(id);
    return { ok: true, data };
  }

  @Post('folders')
  async createFolder(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician || ctx.isClient)) return { ok: false, error: 'Forbidden' };
    const access = await this.canAccessProject(String(body?.projectId || ''), ctx);
    if (!access.ok) return access;
    const data = await this.svc.createFolder(body);
    return { ok: true, data };
  }

  @Post('folders/with-groups')
  async createFolderWithGroups(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician || ctx.isClient)) return { ok: false, error: 'Forbidden' };
    const access = await this.canAccessProject(String(body?.projectId || ''), ctx);
    if (!access.ok) return access;
    try {
      const data = await this.svc.createFolderWithGroups(body);
      return { ok: true, data };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Falha ao criar pasta com grupos' };
    }
  }

  @Get('folders')
  async folders(@Query('projectId') projectId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    const access = await this.canAccessProject(projectId, ctx);
    if (!access.ok) return access;
    const data = await this.svc.listFolders(projectId);
    return { ok: true, data };
  }

  @Put('folders/:id')
  async updateFolder(@Param('id') id: string, @Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician || ctx.isClient)) return { ok: false, error: 'Forbidden' };
    const folder = await this.prisma.adFsFolderNode.findUnique({ where: { id }, select: { projectId: true } });
    if (!folder) return { ok: false, error: 'Pasta não encontrada' };
    const access = await this.canAccessProject(folder.projectId, ctx);
    if (!access.ok) return access;
    const data = await this.svc.updateFolder(id, body);
    return { ok: true, data };
  }

  @Delete('folders/:id')
  async deleteFolder(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician || ctx.isClient)) return { ok: false, error: 'Forbidden' };
    const folder = await this.prisma.adFsFolderNode.findUnique({ where: { id }, select: { projectId: true } });
    if (!folder) return { ok: false, error: 'Pasta não encontrada' };
    const access = await this.canAccessProject(folder.projectId, ctx);
    if (!access.ok) return access;
    const data = await this.svc.deleteFolder(id);
    return { ok: true, data };
  }

  @Post('folder-permissions')
  async createFolderPermission(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician || ctx.isClient)) return { ok: false, error: 'Forbidden' };
    const folder = await this.prisma.adFsFolderNode.findUnique({ where: { id: String(body?.folderNodeId || '') }, select: { projectId: true } });
    if (!folder) return { ok: false, error: 'Pasta não encontrada' };
    const access = await this.canAccessProject(folder.projectId, ctx);
    if (!access.ok) return access;
    try {
      const data = await this.svc.addFolderPermission(body);
      return { ok: true, data };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Falha ao adicionar permissão' };
    }
  }

  @Delete('folder-permissions/:id')
  async deleteFolderPermission(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician || ctx.isClient)) return { ok: false, error: 'Forbidden' };
    const permission = await this.prisma.adFsFolderPermission.findUnique({ where: { id }, include: { folderNode: { select: { projectId: true } } } });
    if (!permission) return { ok: false, error: 'Permissão não encontrada' };
    const access = await this.canAccessProject(permission.folderNode.projectId, ctx);
    if (!access.ok) return access;
    const data = await this.svc.deleteFolderPermission(id);
    return { ok: true, data };
  }

  @Post('gpos')
  async createGpo(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    const access = await this.canAccessProject(String(body?.projectId || ''), ctx);
    if (!access.ok) return access;
    const data = await this.svc.createGpo(body);
    return { ok: true, data };
  }

  @Get('gpos')
  async gpos(@Query('projectId') projectId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    const access = await this.canAccessProject(projectId, ctx);
    if (!access.ok) return access;
    const data = await this.svc.listGpos(projectId);
    return { ok: true, data };
  }

  @Get('script/:projectId')
  async script(@Param('projectId') projectId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    const access = await this.canAccessProject(projectId, ctx);
    if (!access.ok) return access;
    const data = await this.svc.generateScript(projectId);
    return { ok: true, data };
  }
}
