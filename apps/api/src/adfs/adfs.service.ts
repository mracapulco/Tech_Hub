import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AdfsService {
  constructor(private readonly prisma: PrismaService) {}

  listProjects(companyId: string) {
    return this.prisma.adFsProject.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } });
  }

  createProject(data: { companyId: string; name: string; description?: string; domainName?: string; rootOuName?: string; rootPath?: string; userHomeDriveLetter?: string; userHomeLocalRoot?: string; userHomeShareRoot?: string }) {
    return this.prisma.adFsProject.create({
      data: {
        companyId: String(data.companyId),
        name: String(data.name),
        description: data.description || undefined,
        domainName: data.domainName || undefined,
        rootOuName: data.rootOuName || undefined,
        rootPath: data.rootPath || undefined,
        userHomeDriveLetter: data.userHomeDriveLetter || undefined,
        userHomeLocalRoot: data.userHomeLocalRoot || undefined,
        userHomeShareRoot: data.userHomeShareRoot || undefined,
      },
    });
  }

  updateProject(id: string, data: { name?: string; description?: string | null; domainName?: string | null; rootOuName?: string | null; rootPath?: string | null; userHomeDriveLetter?: string | null; userHomeLocalRoot?: string | null; userHomeShareRoot?: string | null; status?: string }) {
    return this.prisma.adFsProject.update({
      where: { id },
      data: {
        name: data.name ? String(data.name) : undefined,
        description: data.description === null ? null : (data.description || undefined),
        domainName: data.domainName === null ? null : (data.domainName || undefined),
        rootOuName: data.rootOuName === null ? null : (data.rootOuName || undefined),
        rootPath: data.rootPath ? String(data.rootPath) : undefined,
        userHomeDriveLetter: data.userHomeDriveLetter === null ? null : (data.userHomeDriveLetter || undefined),
        userHomeLocalRoot: data.userHomeLocalRoot === null ? null : (data.userHomeLocalRoot || undefined),
        userHomeShareRoot: data.userHomeShareRoot === null ? null : (data.userHomeShareRoot || undefined),
        status: data.status ? (data.status as any) : undefined,
      },
    });
  }

  private sortTreeIdsByDepth<T extends { id: string; parentId: string | null }>(items: T[]) {
    const map = new Map(items.map((item) => [item.id, item]));
    const depth = (id: string) => {
      let level = 0;
      let current = map.get(id);
      while (current?.parentId) {
        level += 1;
        current = map.get(current.parentId) || null as any;
      }
      return level;
    };
    return [...items].sort((a, b) => depth(b.id) - depth(a.id)).map((item) => item.id);
  }

  async deleteProject(id: string) {
    const [folderNodes, orgNodes, ouNodes] = await Promise.all([
      this.prisma.adFsFolderNode.findMany({ where: { projectId: id }, select: { id: true, parentId: true } }),
      this.prisma.adFsOrgNode.findMany({ where: { projectId: id }, select: { id: true, parentId: true } }),
      this.prisma.adFsOuNode.findMany({ where: { projectId: id }, select: { id: true, parentId: true } }),
    ]);

    const folderIds = this.sortTreeIdsByDepth(folderNodes.map((item) => ({ id: item.id, parentId: item.parentId || null })));
    const orgIds = this.sortTreeIdsByDepth(orgNodes.map((item) => ({ id: item.id, parentId: item.parentId || null })));
    const ouIds = this.sortTreeIdsByDepth(ouNodes.map((item) => ({ id: item.id, parentId: item.parentId || null })));

    await this.prisma.$transaction(async (tx) => {
      await tx.adFsGpoPlan.deleteMany({ where: { projectId: id } });
      await tx.adFsFolderPermission.deleteMany({ where: { folderNode: { projectId: id } } });
      await tx.adFsUserPlan.deleteMany({ where: { projectId: id } });
      await tx.adFsGroup.deleteMany({ where: { projectId: id } });
      for (const folderId of folderIds) await tx.adFsFolderNode.delete({ where: { id: folderId } });
      for (const ouId of ouIds) await tx.adFsOuNode.delete({ where: { id: ouId } });
      for (const orgId of orgIds) await tx.adFsOrgNode.delete({ where: { id: orgId } });
      await tx.adFsProject.delete({ where: { id } });
    });

    return { deleted: true };
  }

  getProject(id: string) {
    return this.prisma.adFsProject.findUnique({
      where: { id },
      include: {
        orgNodes: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
        ouNodes: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
        groups: { orderBy: { name: 'asc' } },
        users: { include: { groups: true, orgNode: true }, orderBy: { fullName: 'asc' } },
        folders: { include: { permissions: { include: { group: true } } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
        gpos: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
      },
    });
  }

  createOrgNode(data: { projectId: string; parentId?: string; type?: string; name: string; code?: string; description?: string; sortOrder?: number }) {
    return this.prisma.adFsOrgNode.create({
      data: {
        projectId: String(data.projectId),
        parentId: data.parentId || undefined,
        type: (data.type as any) || 'SECTOR',
        name: String(data.name),
        code: data.code || undefined,
        description: data.description || undefined,
        sortOrder: Number(data.sortOrder || 0),
      },
    });
  }

  listOrgNodes(projectId: string) {
    return this.prisma.adFsOrgNode.findMany({ where: { projectId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  updateOrgNode(id: string, data: { parentId?: string | null; type?: string; name?: string; code?: string | null; description?: string | null }) {
    return this.prisma.adFsOrgNode.update({
      where: { id },
      data: {
        parentId: data.parentId === null ? null : (data.parentId || undefined),
        type: data.type ? (data.type as any) : undefined,
        name: data.name ? String(data.name) : undefined,
        code: data.code === null ? null : (data.code || undefined),
        description: data.description === null ? null : (data.description || undefined),
      },
    });
  }

  async deleteOrgNode(id: string) {
    const [childrenCount, usersCount, foldersCount, groupsCount] = await Promise.all([
      this.prisma.adFsOrgNode.count({ where: { parentId: id } }),
      this.prisma.adFsUserPlan.count({ where: { orgNodeId: id } }),
      this.prisma.adFsFolderNode.count({ where: { orgNodeId: id } }),
      this.prisma.adFsGroup.count({ where: { orgNodeId: id } }),
    ]);
    if (childrenCount > 0) throw new Error('Existem subniveis vinculados a este item.');
    if (usersCount > 0 || foldersCount > 0 || groupsCount > 0) throw new Error('Existem usuarios, pastas ou grupos vinculados a este item.');
    await this.prisma.adFsOrgNode.delete({ where: { id } });
    return { deleted: true };
  }

  createOuNode(data: { projectId: string; parentId?: string; name: string; distinguishedName?: string; description?: string; sortOrder?: number }) {
    return this.prisma.adFsOuNode.create({
      data: {
        projectId: String(data.projectId),
        parentId: data.parentId || undefined,
        name: String(data.name),
        distinguishedName: data.distinguishedName || undefined,
        description: data.description || undefined,
        sortOrder: Number(data.sortOrder || 0),
      },
    });
  }

  listOuNodes(projectId: string) {
    return this.prisma.adFsOuNode.findMany({ where: { projectId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  createGroup(data: { projectId: string; kind: string; name: string; description?: string; permission?: string; orgNodeId?: string }) {
    return this.prisma.adFsGroup.create({
      data: {
        projectId: String(data.projectId),
        kind: data.kind as any,
        name: String(data.name),
        description: data.description || undefined,
        permission: data.permission ? (data.permission as any) : undefined,
        orgNodeId: data.orgNodeId || undefined,
      },
    });
  }

  listGroups(projectId: string) {
    return this.prisma.adFsGroup.findMany({ where: { projectId }, orderBy: { name: 'asc' } });
  }

  updateGroup(id: string, data: { name?: string; permission?: string | null }) {
    return this.prisma.adFsGroup.update({
      where: { id },
      data: {
        name: data.name ? String(data.name) : undefined,
        permission: data.permission === null ? null : (data.permission ? (data.permission as any) : undefined),
      },
    });
  }

  async getGroupDependencies(id: string) {
    const group = await this.prisma.adFsGroup.findUnique({
      where: { id },
      include: {
        members: {
          select: { id: true, fullName: true, username: true },
          orderBy: { fullName: 'asc' },
        },
        folderPermissions: {
          include: {
            folderNode: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        orgNode: { select: { id: true, name: true, type: true } },
      },
    });
    if (!group) return null;
    return {
      id: group.id,
      name: group.name,
      kind: group.kind,
      permission: group.permission,
      orgNode: group.orgNode,
      users: group.members,
      folderPermissions: group.folderPermissions.map((item) => ({
        id: item.id,
        permission: item.permission,
        folder: item.folderNode,
      })),
      counts: {
        users: group.members.length,
        folderPermissions: group.folderPermissions.length,
      },
    };
  }

  async deleteGroup(id: string, force = false) {
    const deps = await this.getGroupDependencies(id);
    if (!deps) throw new Error('Grupo não encontrado');
    const hasDependencies = deps.counts.users > 0 || deps.counts.folderPermissions > 0;
    if (hasDependencies && !force) {
      throw new Error(`Grupo vinculado a ${deps.counts.users} usuario(s) e ${deps.counts.folderPermissions} permissao(oes).`);
    }

    await this.prisma.$transaction(async (tx) => {
      if (force) {
        await tx.adFsFolderPermission.deleteMany({ where: { groupId: id } });
        await tx.adFsGroup.update({
          where: { id },
          data: { members: { set: [] } },
        });
      } else {
        await tx.adFsFolderPermission.deleteMany({ where: { groupId: id } });
      }
      await tx.adFsGroup.delete({ where: { id } });
    });
    return { deleted: true, forced: force };
  }

  async createUser(data: { projectId: string; orgNodeId?: string; ouNodeId?: string; fullName: string; firstName: string; lastName?: string; username: string; email?: string; title?: string; initialPassword?: string; homeDriveEnabled?: boolean; homeDriveLetter?: string | null; groupIds?: string[] }) {
    return this.prisma.adFsUserPlan.create({
      data: {
        projectId: String(data.projectId),
        orgNodeId: data.orgNodeId || undefined,
        ouNodeId: data.ouNodeId || undefined,
        fullName: String(data.fullName),
        firstName: String(data.firstName),
        lastName: data.lastName || undefined,
        username: String(data.username),
        email: data.email || undefined,
        title: data.title || undefined,
        initialPassword: data.initialPassword || undefined,
        homeDriveEnabled: data.homeDriveEnabled != null ? Boolean(data.homeDriveEnabled) : false,
        homeDriveLetter: data.homeDriveLetter === null ? null : (data.homeDriveLetter || undefined),
        groups: data.groupIds?.length ? { connect: data.groupIds.map((id) => ({ id })) } : undefined,
      },
      include: { groups: true },
    });
  }

  listUsers(projectId: string) {
    return this.prisma.adFsUserPlan.findMany({ where: { projectId }, include: { groups: true }, orderBy: { fullName: 'asc' } });
  }

  async updateUser(id: string, data: { orgNodeId?: string | null; ouNodeId?: string | null; fullName?: string; firstName?: string; lastName?: string | null; username?: string; email?: string | null; title?: string | null; initialPassword?: string | null; homeDriveEnabled?: boolean; homeDriveLetter?: string | null; groupIds?: string[] }) {
    return this.prisma.adFsUserPlan.update({
      where: { id },
      data: {
        orgNodeId: data.orgNodeId === null ? null : (data.orgNodeId || undefined),
        ouNodeId: data.ouNodeId === null ? null : (data.ouNodeId || undefined),
        fullName: data.fullName ? String(data.fullName) : undefined,
        firstName: data.firstName ? String(data.firstName) : undefined,
        lastName: data.lastName === null ? null : (data.lastName || undefined),
        username: data.username ? String(data.username) : undefined,
        email: data.email === null ? null : (data.email || undefined),
        title: data.title === null ? null : (data.title || undefined),
        initialPassword: data.initialPassword === null ? null : (data.initialPassword || undefined),
        homeDriveEnabled: data.homeDriveEnabled != null ? Boolean(data.homeDriveEnabled) : undefined,
        homeDriveLetter: data.homeDriveLetter === null ? null : (data.homeDriveLetter || undefined),
        groups: data.groupIds ? { set: data.groupIds.map((groupId) => ({ id: groupId })) } : undefined,
      },
      include: { groups: true },
    });
  }

  async deleteUser(id: string) {
    await this.prisma.adFsUserPlan.delete({ where: { id } });
    return { deleted: true };
  }

  createFolder(data: { projectId: string; parentId?: string; orgNodeId?: string; type?: string; name: string; pathOverride?: string; disableInheritance?: boolean; appliesTo?: string; sortOrder?: number }) {
    return this.prisma.adFsFolderNode.create({
      data: {
        projectId: String(data.projectId),
        parentId: data.parentId || undefined,
        orgNodeId: data.orgNodeId || undefined,
        type: (data.type as any) || 'FOLDER',
        name: String(data.name),
        pathOverride: data.pathOverride || undefined,
        disableInheritance: data.disableInheritance != null ? Boolean(data.disableInheritance) : true,
        appliesTo: data.appliesTo || undefined,
        sortOrder: Number(data.sortOrder || 0),
      },
    });
  }

  listFolders(projectId: string) {
    return this.prisma.adFsFolderNode.findMany({
      where: { projectId },
      include: { permissions: { include: { group: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  updateFolder(id: string, data: { name?: string; disableInheritance?: boolean }) {
    return this.prisma.adFsFolderNode.update({
      where: { id },
      data: {
        name: data.name ? String(data.name) : undefined,
        disableInheritance: data.disableInheritance != null ? Boolean(data.disableInheritance) : undefined,
      },
      include: { permissions: { include: { group: true } } },
    });
  }

  async deleteFolder(id: string) {
    const target = await this.prisma.adFsFolderNode.findUnique({ where: { id }, select: { id: true, projectId: true } });
    if (!target) return { deleted: false };
    const allFolders = await this.prisma.adFsFolderNode.findMany({ where: { projectId: target.projectId }, select: { id: true, parentId: true } });
    const ids = new Set<string>([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of allFolders) {
        if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
          ids.add(folder.id);
          changed = true;
        }
      }
    }
    const orderedIds = Array.from(ids).sort((a, b) => {
      const depth = (folderId: string) => {
        let d = 0;
        let current = allFolders.find((f) => f.id === folderId);
        while (current?.parentId) {
          d += 1;
          current = allFolders.find((f) => f.id === current?.parentId);
        }
        return d;
      };
      return depth(b) - depth(a);
    });
    const folderPermissions = await this.prisma.adFsFolderPermission.findMany({
      where: { folderNodeId: { in: orderedIds } },
      select: { groupId: true },
    });
    const candidateGroupIds = [...new Set(folderPermissions.map((item) => item.groupId))];
    const groupsStillUsedOutsideBranch = await this.prisma.adFsFolderPermission.findMany({
      where: {
        groupId: { in: candidateGroupIds },
        folderNodeId: { notIn: orderedIds },
      },
      select: { groupId: true },
    });
    const lockedGroupIds = new Set(groupsStillUsedOutsideBranch.map((item) => item.groupId));
    const deletableGroupIds = candidateGroupIds.filter((groupId) => !lockedGroupIds.has(groupId));

    await this.prisma.$transaction(async (tx) => {
      await tx.adFsFolderPermission.deleteMany({ where: { folderNodeId: { in: orderedIds } } });
      for (const groupId of deletableGroupIds) {
        await tx.adFsGroup.update({
          where: { id: groupId },
          data: { members: { set: [] } },
        });
        await tx.adFsGroup.delete({ where: { id: groupId } });
      }
      for (const folderId of orderedIds) {
        await tx.adFsFolderNode.delete({ where: { id: folderId } });
      }
    });
    return { deleted: true, deletedGroups: deletableGroupIds.length, keptGroups: lockedGroupIds.size };
  }

  async addFolderPermission(data: { folderNodeId: string; groupId: string; permission: string; appliesTo?: string; deny?: boolean }) {
    if (String(data.permission || '') === 'LG' && !data.deny) {
      const existingLg = await this.prisma.adFsFolderPermission.findFirst({
        where: {
          folderNodeId: String(data.folderNodeId),
          permission: 'LG' as any,
          deny: false,
        },
        include: { group: { select: { name: true } } },
      });
      if (existingLg) {
        throw new Error(`Esta pasta já possui um grupo LG definido como proprietário: ${existingLg.group.name}.`);
      }
    }
    return this.prisma.adFsFolderPermission.create({
      data: {
        folderNodeId: String(data.folderNodeId),
        groupId: String(data.groupId),
        permission: data.permission as any,
        appliesTo: data.appliesTo || undefined,
        deny: data.deny != null ? Boolean(data.deny) : false,
      },
      include: { group: true },
    });
  }

  deleteFolderPermission(id: string) {
    return this.prisma.adFsFolderPermission.delete({ where: { id } });
  }

  createGpo(data: { projectId: string; ouNodeId?: string; name: string; description?: string; category?: string; linkEnabled?: boolean; sortOrder?: number }) {
    return this.prisma.adFsGpoPlan.create({
      data: {
        projectId: String(data.projectId),
        ouNodeId: data.ouNodeId || undefined,
        name: String(data.name),
        description: data.description || undefined,
        category: data.category || undefined,
        linkEnabled: data.linkEnabled != null ? Boolean(data.linkEnabled) : true,
        sortOrder: Number(data.sortOrder || 0),
      },
    });
  }

  listGpos(projectId: string) {
    return this.prisma.adFsGpoPlan.findMany({ where: { projectId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  private sanitizeName(raw: string) {
    return String(raw || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
  }

  private buildFolderPath(folder: any, map: Map<string, any>, rootPath: string): string {
    if (folder.pathOverride) return String(folder.pathOverride);
    const segments: string[] = [folder.name];
    let current = folder;
    while (current?.parentId) {
      current = map.get(current.parentId);
      if (current) segments.unshift(current.name);
    }
    return `${rootPath}\\${segments.join('\\')}`;
  }

  private domainToDn(domainName?: string | null) {
    if (!domainName) return 'DC=example,DC=local';
    return String(domainName)
      .split('.')
      .filter(Boolean)
      .map((part) => `DC=${part}`)
      .join(',');
  }

  private buildOrgOuPath(node: any, map: Map<string, any>, sectorsOuDn: string): string {
    if (!node.parentId) return sectorsOuDn;
    const parent = map.get(node.parentId);
    if (!parent) return sectorsOuDn;
    return `OU=${parent.name},${this.buildOrgOuPath(parent, map, sectorsOuDn)}`;
  }

  async generateScript(projectId: string) {
    const project = await this.prisma.adFsProject.findUnique({
      where: { id: projectId },
      include: {
        orgNodes: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
        ouNodes: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
        groups: { orderBy: { name: 'asc' } },
        users: { include: { groups: true }, orderBy: { fullName: 'asc' } },
        folders: { include: { permissions: { include: { group: true } } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
        gpos: { include: { ouNode: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
      },
    });
    if (!project) return { script: '', projectName: '' };

    const ouMap = new Map(project.ouNodes.map((o) => [o.id, o]));
    const orgMap = new Map(project.orgNodes.map((o) => [o.id, o]));
    const folderMap = new Map(project.folders.map((f) => [f.id, f]));
    const rootPath = project.rootPath || 'D:\\FILESERVER';
    const userHomeDriveLetter = (project as any).userHomeDriveLetter || 'U';
    const userHomeLocalRoot = (project as any).userHomeLocalRoot || '';
    const userHomeShareRoot = (project as any).userHomeShareRoot || '';
    const domainDn = this.domainToDn(project.domainName);
    const rootOuName = project.rootOuName || 'EMPRESA';
    const rootOuDn = `OU=${rootOuName},${domainDn}`;
    const fileServerOuDn = `OU=FILESERVER,${rootOuDn}`;
    const sectorsOuDn = `OU=SETORES,${rootOuDn}`;

    const psEscape = (value: any) => String(value ?? '').replace(/"/g, '""');

    const rootFolderName = (() => {
      const cleaned = String(rootPath).replace(/[\\/]+$/g, '');
      const parts = cleaned.split(/[\\/]/g).filter(Boolean);
      const last = parts[parts.length - 1] || 'FILESERVER';
      return last.replace(/:$/, '') || 'FILESERVER';
    })();

    const rootGfName = `GF_${this.sanitizeName(rootFolderName)}`;

    const allGroupNames = new Set<string>(project.groups.map((g) => g.name));
    allGroupNames.add(rootGfName);

    const topLevelFolders = project.folders.filter((f) => !f.parentId);
    const topLevelGfNames = topLevelFolders.map((f) => `GF_${this.sanitizeName(f.name)}`);
    for (const gfName of topLevelGfNames) allGroupNames.add(gfName);

    const orgLines = [...project.orgNodes]
      .sort((a, b) => {
        const depth = (node: any) => {
          let level = 0;
          let current = node;
          while (current?.parentId) {
            level += 1;
            current = orgMap.get(current.parentId);
          }
          return level;
        };
        return depth(a) - depth(b) || a.name.localeCompare(b.name);
      })
      .map((node) => `Ensure-TechHubOu -Name "${psEscape(node.name)}" -Path "${psEscape(this.buildOrgOuPath(node, orgMap, sectorsOuDn))}"`);

    const ouLines = project.ouNodes.map((o) => {
      const path = o.parentId ? (ouMap.get(o.parentId)?.distinguishedName || domainDn) : domainDn;
      return `Ensure-TechHubOu -Name "${psEscape(o.name)}" -Path "${psEscape(path)}"`;
    });

    const groupLines = [
      ...Array.from(allGroupNames)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => `Ensure-TechHubAdGroup -Name "${psEscape(name)}" -Path "${psEscape(fileServerOuDn)}"`),
    ];

    const groupNestingLines: string[] = [];
    for (const gfName of topLevelGfNames) {
      groupNestingLines.push(`Ensure-TechHubAdGroupInclude -Parent "${psEscape(rootGfName)}" -Child "${psEscape(gfName)}"`);
    }
    const topFolderOf = (folder: any): any => {
      let current = folder;
      while (current?.parentId) {
        const parent = folderMap.get(current.parentId);
        if (!parent) break;
        current = parent;
      }
      return current;
    };
    for (const folder of project.folders) {
      const top = topFolderOf(folder);
      if (!top?.id) continue;
      const parentGf = `GF_${this.sanitizeName(top.name)}`;
      for (const perm of folder.permissions || []) {
        if (perm?.group?.kind === 'GA') {
          groupNestingLines.push(`Ensure-TechHubAdGroupInclude -Parent "${psEscape(parentGf)}" -Child "${psEscape(perm.group.name)}"`);
        }
      }
    }

    const userLines = project.users.flatMap((u: any) => {
      const orgNode = u.orgNodeId ? orgMap.get(u.orgNodeId) : null;
      const targetOu = orgNode ? `OU=${orgNode.name},${this.buildOrgOuPath(orgNode, orgMap, sectorsOuDn)}` : sectorsOuDn;
      const password = u.initialPassword || 'Temp@123456';
      const sam = String(u.username || '').slice(0, 20);
      const lines: string[] = [];
      if (u.homeDriveEnabled) {
        const driveLetter = String(u.homeDriveLetter || userHomeDriveLetter || 'U').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1) || 'U';
        lines.push(`$TechHubHomeDrive = "${psEscape(driveLetter)}:"`);
        lines.push(`if ([string]::IsNullOrWhiteSpace($UserHomeLocalRoot) -or [string]::IsNullOrWhiteSpace($UserHomeShareRoot)) { throw "Configuração de pasta pessoal ausente no projeto." }`);
        lines.push(`$TechHubHomeLocal = Join-TechHubPath -Base $UserHomeLocalRoot -Child "${psEscape(sam)}"`);
        lines.push(`$TechHubHomeShare = Join-TechHubPath -Base $UserHomeShareRoot -Child "${psEscape(sam)}"`);
        lines.push(
          `Ensure-TechHubAdUser -Name "${psEscape(u.fullName)}" -GivenName "${psEscape(u.firstName)}" -Surname "${psEscape(u.lastName || '')}" -SamAccountName "${psEscape(sam)}" -UserPrincipalName "${psEscape(String(u.username || ''))}@${psEscape(project.domainName || 'example.local')}" -Path "${psEscape(targetOu)}" -EmailAddress "${psEscape(u.email || '')}" -Title "${psEscape(u.title || '')}" -Password "${psEscape(password)}" -HomeDrive $TechHubHomeDrive -HomeDirectory $TechHubHomeShare`,
        );
        lines.push(`Ensure-TechHubUserHomeFolder -Path $TechHubHomeLocal -Owner "${psEscape(sam)}"`);
      } else {
        lines.push(
          `Ensure-TechHubAdUser -Name "${psEscape(u.fullName)}" -GivenName "${psEscape(u.firstName)}" -Surname "${psEscape(u.lastName || '')}" -SamAccountName "${psEscape(sam)}" -UserPrincipalName "${psEscape(String(u.username || ''))}@${psEscape(project.domainName || 'example.local')}" -Path "${psEscape(targetOu)}" -EmailAddress "${psEscape(u.email || '')}" -Title "${psEscape(u.title || '')}" -Password "${psEscape(password)}"`,
        );
      }
      for (const g of u.groups) lines.push(`Ensure-TechHubAdGroupInclude -Parent "${psEscape(g.name)}" -Child "${psEscape(sam)}"`);
      return lines;
    });

    const folderLines = project.folders.flatMap((f) => {
      const path = this.buildFolderPath(f, folderMap, rootPath);
      const lines: string[] = [`Ensure-TechHubFolder -Path "${psEscape(path)}"`];
      if (f.disableInheritance) lines.push(`Ensure-TechHubDisableInheritance -Path "${psEscape(path)}" -Mode "d"`);
      lines.push(`Ensure-TechHubAdministratorsFullControl -Path "${psEscape(path)}"`);
      lines.push(`Ensure-TechHubSystemFullControl -Path "${psEscape(path)}"`);
      lines.push(`Ensure-TechHubCreatorOwnerFullControl -Path "${psEscape(path)}"`);
      for (const p of f.permissions) {
        const permMap: Record<string, string> = { L: 'R', LG: 'M', LE: 'RX', FULL: 'F' };
        const right = permMap[p.permission] || 'R';
        lines.push(`Ensure-TechHubFolderPermission -Path "${psEscape(path)}" -Identity "${psEscape(p.group.name)}" -Right "${right}" -AppliesTo "${psEscape(p.appliesTo || 'ThisFolderSubfoldersAndFiles')}" -Deny:$${p.deny ? 'true' : 'false'}`);
      }
      return lines;
    });

    const gpoLines = project.gpos.map((g) => {
      const target = g.ouNode?.distinguishedName || 'DC=example,DC=local';
      return [
        `New-GPO -Name "${g.name}" | Out-Null`,
        g.linkEnabled ? `New-GPLink -Name "${g.name}" -Target "${target}" -Enforced:$false | Out-Null` : `# GPO ${g.name} criada sem vínculo automático`,
      ].join('\n');
    });

    const functions = [
      'function Write-TechHubStep {',
      '  param([string]$Message)',
      '  Write-Host ("[TechHub] " + $Message)',
      '}',
      '',
      'function Get-TechHubDomainNetbios {',
      '  if ($script:TechHubDomainNetbios) { return $script:TechHubDomainNetbios }',
      '  $n = (Get-ADDomain -ErrorAction Stop).NetBIOSName',
      '  $script:TechHubDomainNetbios = $n',
      '  return $n',
      '}',
      '',
      'function Resolve-TechHubIdentity {',
      '  param([string]$SamAccountName)',
      '  if ([string]::IsNullOrWhiteSpace($SamAccountName)) { throw "Identity vazia." }',
      '  if ($SamAccountName.StartsWith("*")) { return $SamAccountName }',
      '  $d = Get-TechHubDomainNetbios',
      '  return "$d\\$SamAccountName"',
      '}',
      '',
      'function Join-TechHubPath {',
      '  param([string]$Base,[string]$Child)',
      '  $b = ($Base -replace "[\\\\/]+$","")',
      '  $c = ($Child -replace "^[\\\\/]+","")',
      '  if ([string]::IsNullOrWhiteSpace($b)) { return $c }',
      '  if ([string]::IsNullOrWhiteSpace($c)) { return $b }',
      '  return "$b\\$c"',
      '}',
      '',
      'function Ensure-TechHubOu {',
      '  param([string]$Name,[string]$Path)',
      '  try {',
      '    $found = Get-ADOrganizationalUnit -Filter "Name -eq \\"$Name\\"" -SearchBase $Path -ErrorAction Stop | Select-Object -First 1',
      '    if ($found) { return }',
      '  } catch {',
      '    throw ("Falha ao consultar OU em " + $Path + ": " + $_.Exception.Message)',
      '  }',
      '  try {',
      '    New-ADOrganizationalUnit -Name $Name -Path $Path -ProtectedFromAccidentalDeletion $false -ErrorAction Stop | Out-Null',
      '  } catch {',
      '    throw ("Falha ao criar OU " + $Name + " em " + $Path + ": " + $_.Exception.Message)',
      '  }',
      '}',
      '',
      'function Ensure-TechHubAdGroup {',
      '  param([string]$Name,[string]$Path)',
      '  $g = $null',
      '  try { $g = Get-ADGroup -Identity $Name -ErrorAction Stop } catch { }',
      '  if ($g) { return }',
      '  try {',
      '    New-ADGroup -Name $Name -SamAccountName $Name -GroupScope Global -GroupCategory Security -Path $Path -ErrorAction Stop | Out-Null',
      '  } catch {',
      '    throw ("Falha ao criar grupo " + $Name + ": " + $_.Exception.Message)',
      '  }',
      '}',
      '',
      'function Ensure-TechHubAdUser {',
      '  param(',
      '    [string]$Name,',
      '    [string]$GivenName,',
      '    [string]$Surname,',
      '    [string]$SamAccountName,',
      '    [string]$UserPrincipalName,',
      '    [string]$Path,',
      '    [string]$EmailAddress,',
      '    [string]$Title,',
      '    [string]$Password,',
      '    [string]$HomeDrive = "",',
      '    [string]$HomeDirectory = ""',
      '  )',
      '  $existing = $null',
      '  try { $existing = Get-ADUser -Identity $SamAccountName -ErrorAction Stop } catch { }',
      '  if ($existing) {',
      '    if (!([string]::IsNullOrWhiteSpace($HomeDrive) -or [string]::IsNullOrWhiteSpace($HomeDirectory))) {',
      '      try { Set-ADUser -Identity $SamAccountName -HomeDrive $HomeDrive -HomeDirectory $HomeDirectory -ErrorAction Stop } catch { throw ("Falha ao atualizar HomeDrive/HomeDirectory do usuário " + $SamAccountName + ": " + $_.Exception.Message) }',
      '    }',
      '    return',
      '  }',
      '  try {',
      '    $secure = ConvertTo-SecureString $Password -AsPlainText -Force',
      '    if ([string]::IsNullOrWhiteSpace($HomeDrive) -or [string]::IsNullOrWhiteSpace($HomeDirectory)) {',
      '      New-ADUser -Name $Name -GivenName $GivenName -Surname $Surname -SamAccountName $SamAccountName -UserPrincipalName $UserPrincipalName -Path $Path -EmailAddress $EmailAddress -Title $Title -AccountPassword $secure -Enabled $true -ErrorAction Stop | Out-Null',
      '    } else {',
      '      New-ADUser -Name $Name -GivenName $GivenName -Surname $Surname -SamAccountName $SamAccountName -UserPrincipalName $UserPrincipalName -Path $Path -EmailAddress $EmailAddress -Title $Title -AccountPassword $secure -Enabled $true -HomeDrive $HomeDrive -HomeDirectory $HomeDirectory -ErrorAction Stop | Out-Null',
      '    }',
      '  } catch {',
      '    throw ("Falha ao criar usuário " + $SamAccountName + ": " + $_.Exception.Message)',
      '  }',
      '}',
      '',
      'function Ensure-TechHubAdGroupInclude {',
      '  param([string]$Parent,[string]$Child)',
      '  $already = $false',
      '  try {',
      '    $list = Get-ADGroupMember -Identity $Parent -Recursive:$false -ErrorAction Stop | Select-Object -ExpandProperty SamAccountName',
      '    if ($list -contains $Child) { $already = $true }',
      '  } catch { }',
      '  if ($already) { return }',
      '  try {',
      '    Add-ADGroupMember -Identity $Parent -Members $Child -ErrorAction Stop',
      '  } catch {',
      '    if ($_.Exception.Message -match "already" -or $_.Exception.Message -match "já") { return }',
      '    throw ("Falha ao incluir " + $Child + " no grupo " + $Parent + ": " + $_.Exception.Message)',
      '  }',
      '}',
      '',
      'function Ensure-TechHubFolder {',
      '  param([string]$Path)',
      '  try {',
      '    New-Item -ItemType Directory -Force -Path $Path -ErrorAction Stop | Out-Null',
      '  } catch {',
      '    throw ("Falha ao criar pasta " + $Path + ": " + $_.Exception.Message)',
      '  }',
      '}',
      '',
      'function Ensure-TechHubDisableInheritance {',
      '  param([string]$Path,[ValidateSet("d","r")][string]$Mode)',
      '  if (!(Test-Path -LiteralPath $Path)) { throw ("Pasta não encontrada para ajustar herança: " + $Path) }',
      '  icacls "$Path" "/inheritance:$Mode" | Out-Null',
      '  if ($LASTEXITCODE -ne 0) { throw ("Falha no icacls (inheritance) em " + $Path + ". Código: " + $LASTEXITCODE) }',
      '}',
      '',
      'function Convert-TechHubAppliesTo {',
      '  param([string]$AppliesTo)',
      '  switch ($AppliesTo) {',
      '    "ThisFolderOnly" { return "" }',
      '    "ThisFolderSubfoldersAndFiles" { return "(OI)(CI)" }',
      '    "ThisFolderSubfoldersOnly" { return "(CI)" }',
      '    "ThisFolderFilesOnly" { return "(OI)" }',
      '    "SubfoldersAndFilesOnly" { return "(OI)(CI)(IO)" }',
      '    default { return "(OI)(CI)" }',
      '  }',
      '}',
      '',
      'function Ensure-TechHubFolderPermission {',
      '  param(',
      '    [string]$Path,',
      '    [string]$Identity,',
      '    [string]$Right,',
      '    [string]$AppliesTo = "ThisFolderSubfoldersAndFiles",',
      '    [switch]$Deny',
      '  )',
      '  if (!(Test-Path -LiteralPath $Path)) { throw ("Pasta não encontrada para aplicar permissão: " + $Path) }',
      '  $resolved = Resolve-TechHubIdentity -SamAccountName $Identity',
      '  $flags = Convert-TechHubAppliesTo -AppliesTo $AppliesTo',
      '  $ace = if ([string]::IsNullOrWhiteSpace($flags)) { "${resolved}:($Right)" } else { "${resolved}:$flags($Right)" }',
      '  if ($Deny) {',
      '    icacls "$Path" /deny "$ace" | Out-Null',
      '  } else {',
      '    icacls "$Path" /grant:r "$ace" | Out-Null',
      '  }',
      '  if ($LASTEXITCODE -ne 0) { throw ("Falha no icacls em " + $Path + " para " + $ace + ". Código: " + $LASTEXITCODE) }',
      '}',
      '',
      'function Ensure-TechHubAdministratorsFullControl {',
      '  param([string]$Path)',
      '  Ensure-TechHubFolderPermission -Path $Path -Identity "*S-1-5-32-544" -Right "F" -AppliesTo "ThisFolderSubfoldersAndFiles"',
      '}',
      '',
      'function Ensure-TechHubSystemFullControl {',
      '  param([string]$Path)',
      '  Ensure-TechHubFolderPermission -Path $Path -Identity "*S-1-5-18" -Right "F" -AppliesTo "ThisFolderSubfoldersAndFiles"',
      '}',
      '',
      'function Ensure-TechHubCreatorOwnerFullControl {',
      '  param([string]$Path)',
      '  Ensure-TechHubFolderPermission -Path $Path -Identity "*S-1-3-0" -Right "F" -AppliesTo "SubfoldersAndFilesOnly"',
      '}',
      '',
      'function Ensure-TechHubUserHomeFolder {',
      '  param([string]$Path,[string]$Owner)',
      '  $ownerId = Resolve-TechHubIdentity -SamAccountName $Owner',
      '  Ensure-TechHubFolder -Path $Path',
      '  Ensure-TechHubDisableInheritance -Path $Path -Mode "d"',
      '  Ensure-TechHubAdministratorsFullControl -Path $Path',
      '  Ensure-TechHubSystemFullControl -Path $Path',
      '  Ensure-TechHubCreatorOwnerFullControl -Path $Path',
      '  Ensure-TechHubFolderPermission -Path $Path -Identity $Owner -Right "F" -AppliesTo "ThisFolderSubfoldersAndFiles"',
      '  icacls "$Path" /setowner "$ownerId" | Out-Null',
      '  if ($LASTEXITCODE -ne 0) { throw ("Falha no icacls (setowner) em " + $Path + " para " + $ownerId + ". Código: " + $LASTEXITCODE) }',
      '}',
    ].join('\n');

    const script = [
      '# Tech Hub - AD / File Server V1',
      functions,
      `$ProjectName = "${project.name}"`,
      `$DomainDn = "${domainDn}"`,
      `$RootOuName = "${rootOuName}"`,
      `$RootOuDn = "${rootOuDn}"`,
      `$FileServerOuDn = "${fileServerOuDn}"`,
      `$SectorsOuDn = "${sectorsOuDn}"`,
      `$RootPath = "${rootPath}"`,
      `$UserHomeDriveLetter = "${psEscape(userHomeDriveLetter)}"`,
      `$UserHomeLocalRoot = "${psEscape(userHomeLocalRoot)}"`,
      `$UserHomeShareRoot = "${psEscape(userHomeShareRoot)}"`,
      `$ErrorActionPreference = "Stop"`,
      `Import-Module ActiveDirectory -ErrorAction Stop`,
      `Import-Module GroupPolicy -ErrorAction Stop`,
      `$script:TechHubDomainNetbios = (Get-ADDomain -ErrorAction Stop).NetBIOSName`,
      `Write-TechHubStep "Domínio (NetBIOS): $script:TechHubDomainNetbios"`,
      '',
      '# Estrutura raiz do projeto no AD',
      `Ensure-TechHubOu -Name "${psEscape(rootOuName)}" -Path "${psEscape(domainDn)}"`,
      `Ensure-TechHubOu -Name "SETORES" -Path "${psEscape(rootOuDn)}"`,
      `Ensure-TechHubOu -Name "FILESERVER" -Path "${psEscape(rootOuDn)}"`,
      '',
      '# Estrutura organizacional',
      ...orgLines,
      '',
      '# OUs',
      ...ouLines,
      '',
      '# Grupos',
      ...groupLines,
      '',
      '# Inclusões (nesting)',
      ...groupNestingLines,
      '',
      '# Usuarios',
      ...userLines,
      '',
      '# Pastas e permissoes',
      `Ensure-TechHubFolder -Path "$RootPath"`,
      `Ensure-TechHubDisableInheritance -Path "$RootPath" -Mode "r"`,
      `Ensure-TechHubAdministratorsFullControl -Path "$RootPath"`,
      `Ensure-TechHubSystemFullControl -Path "$RootPath"`,
      `Ensure-TechHubCreatorOwnerFullControl -Path "$RootPath"`,
      `Ensure-TechHubFolderPermission -Path "$RootPath" -Identity "${psEscape(rootGfName)}" -Right "RX" -AppliesTo "ThisFolderOnly"`,
      ...folderLines,
      '',
      '# GPOs',
      ...gpoLines,
      '',
    ].join('\n');

    return { script, projectName: project.name };
  }
}
