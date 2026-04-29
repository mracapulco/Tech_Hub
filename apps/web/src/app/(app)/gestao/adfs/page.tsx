"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { getToken } from "@/lib/auth";

type Company = { id: string; name: string; fantasyName?: string };
type Project = { id: string; name: string; description?: string; domainName?: string; rootOuName?: string; rootPath: string; status: string };
type OrgNode = { id: string; parentId?: string; type: string; name: string };
type OrgTreeNode = OrgNode & { children: OrgTreeNode[] };
type Group = { id: string; kind: string; name: string; permission?: string };
type UserPlan = {
  id: string;
  fullName: string;
  firstName: string;
  lastName?: string;
  username: string;
  email?: string;
  title?: string;
  initialPassword?: string | null;
  groups: Group[];
  orgNode?: { id: string; parentId?: string; type: string; name: string } | null;
};
type Folder = { id: string; parentId?: string; name: string; disableInheritance: boolean; permissions: Array<{ id: string; permission: string; group: Group }> };
type FolderTreeNode = Folder & { children: FolderTreeNode[] };
type GroupDependency = {
  id: string;
  name: string;
  kind: string;
  permission?: string;
  orgNode?: { id: string; name: string; type: string } | null;
  users: Array<{ id: string; fullName: string; username: string }>;
  folderPermissions: Array<{ id: string; permission: string; folder: { id: string; name: string } }>;
  counts: { users: number; folderPermissions: number };
};

export default function AdFsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [orgNodes, setOrgNodes] = useState<OrgNode[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<UserPlan[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [script, setScript] = useState<string>("");

  const [pName, setPName] = useState("");
  const [pDomain, setPDomain] = useState("");
  const [pRootOu, setPRootOu] = useState("");
  const [pRoot, setPRoot] = useState("D:\\FILESERVER");

  const [orgName, setOrgName] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [expandedOrgIds, setExpandedOrgIds] = useState<string[]>([]);
  const [editOrgName, setEditOrgName] = useState("");

  const [uFullName, setUFullName] = useState("");
  const [uFirstName, setUFirstName] = useState("");
  const [uLastName, setULastName] = useState("");
  const [uUsername, setUUsername] = useState("");
  const [uEmail, setUEmail] = useState("");
  const [uTitle, setUTitle] = useState("");
  const [uPasswordMode, setUPasswordMode] = useState<"RANDOM" | "FIXED">("RANDOM");
  const [uInitialPassword, setUInitialPassword] = useState("");
  const [uGroupIds, setUGroupIds] = useState<string[]>([]);
  const [uHiddenGroupIds, setUHiddenGroupIds] = useState<string[]>([]);
  const [uOrgId, setUOrgId] = useState("");
  const [editingUserId, setEditingUserId] = useState("");
  const userImportInputRef = useRef<HTMLInputElement | null>(null);

  const [fName, setFName] = useState("");
  const [fDisableInheritance, setFDisableInheritance] = useState(true);
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([]);
  const [newFolderCreateGf, setNewFolderCreateGf] = useState(false);
  const [newFolderCreateL, setNewFolderCreateL] = useState(true);
  const [newFolderCreateLg, setNewFolderCreateLg] = useState(true);
  const [newFolderCreateFull, setNewFolderCreateFull] = useState(false);
  const [ensureParentGf, setEnsureParentGf] = useState(true);
  const [fpGroupId, setFpGroupId] = useState("");
  const [fpPermission, setFpPermission] = useState("L");
  const [editFolderName, setEditFolderName] = useState("");
  const [editFolderInheritance, setEditFolderInheritance] = useState(true);
  const [editingGroupId, setEditingGroupId] = useState("");
  const [editingGroupName, setEditingGroupName] = useState("");
  const [editingGroupPermission, setEditingGroupPermission] = useState("L");
  const [groupSearch, setGroupSearch] = useState("");
  const [groupDependencies, setGroupDependencies] = useState<GroupDependency | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) { setError("Sessão expirada."); return; }
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: Company[] }>("/companies", token);
        const arr = Array.isArray(res?.data) ? res.data : [];
        setCompanies(arr);
        const first = arr[0]?.id || "";
        setCompanyId(first);
      } catch {
        setError("Falha ao carregar empresas.");
      }
    })();
  }, []);

  const selectedProject = useMemo(() => projects.find((project) => project.id === projectId) || null, [projects, projectId]);

  async function refreshProjects(cid: string) {
    const token = getToken();
    if (!token || !cid) return;
    const pr = await apiGet<{ ok: boolean; data?: Project[]; error?: string }>(`/adfs/projects?companyId=${cid}`, token);
    if (!pr?.ok) {
      setError(pr?.error || "Falha ao carregar projetos.");
      return;
    }
    const arr = pr?.data || [];
    setProjects(arr);
    if (!projectId && arr[0]?.id) setProjectId(arr[0].id);
  }

  useEffect(() => {
    if (companyId) refreshProjects(companyId);
  }, [companyId]);

  useEffect(() => {
    if (selectedProject) {
      setPName(selectedProject.name || "");
      setPDomain(selectedProject.domainName || "");
      setPRootOu(selectedProject.rootOuName || "");
      setPRoot(selectedProject.rootPath || "D:\\FILESERVER");
    } else {
      setPName("");
      setPDomain("");
      setPRootOu("");
      setPRoot("D:\\FILESERVER");
    }
  }, [selectedProject]);

  async function loadProject(pid: string) {
    const token = getToken();
    if (!token || !pid) return;
    setLoading(true);
    setError(null);
    try {
      const d = await apiGet<{ ok: boolean; data?: any; error?: string }>(`/adfs/projects/${pid}`, token);
      if (!d?.ok) {
        setError(d?.error || "Falha ao carregar projeto.");
        return;
      }
      const p = d?.data;
      setOrgNodes(p?.orgNodes || []);
      setGroups(p?.groups || []);
      setUsers(p?.users || []);
      setFolders(p?.folders || []);
      const s = await apiGet<{ ok: boolean; data?: { script: string }; error?: string }>(`/adfs/script/${pid}`, token);
      if (!s?.ok) {
        setError(s?.error || "Falha ao gerar script.");
        return;
      }
      setScript(s?.data?.script || "");
    } catch {
      setError("Falha ao carregar projeto.");
    } finally {
      setLoading(false);
    }
  }

  function downloadPs1() {
    if (!script) return;
    const baseName = (selectedProject?.name || "script")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const content = `\ufeff${script}`.replace(/\n/g, "\r\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TechHub-ADFS-${baseName || "script"}.ps1`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  useEffect(() => { if (projectId) loadProject(projectId); }, [projectId]);

  function resetProjectForm() {
    setProjectId("");
    setPName("");
    setPDomain("");
    setPRootOu("");
    setPRoot("D:\\FILESERVER");
    setError(null);
  }

  async function submitProject() {
    const token = getToken();
    if (!token || !companyId) return;
    setLoading(true); setError(null);
    try {
      if (projectId) {
        const r = await apiPut<{ ok: boolean; data?: Project; error?: string }>(`/adfs/projects/${projectId}`, token, {
          name: pName,
          domainName: pDomain || null,
          rootOuName: pRootOu || null,
          rootPath: pRoot || null,
        });
        if (!r?.ok) setError(r?.error || "Falha ao atualizar projeto.");
        else await refreshProjects(companyId);
      } else {
        const r = await apiPost<{ ok: boolean; data?: Project; error?: string }>(`/adfs/projects`, token, {
          companyId,
          name: pName,
          domainName: pDomain || undefined,
          rootOuName: pRootOu || undefined,
          rootPath: pRoot || undefined,
        });
        if (r?.ok) {
          await refreshProjects(companyId);
          if (r.data?.id) setProjectId(r.data.id);
        } else setError(r?.error || "Falha ao criar projeto.");
      }
    } catch { setError("Falha ao comunicar com a API."); } finally { setLoading(false); }
  }

  async function removeProject() {
    const token = getToken();
    if (!token || !projectId) return;
    if (!window.confirm("Excluir este projeto e toda a estrutura vinculada?")) return;
    setLoading(true);
    setError(null);
    try {
      const r = await apiDelete<{ ok: boolean; error?: string }>(`/adfs/projects/${projectId}`, token);
      if (!r?.ok) {
        setError(r?.error || "Falha ao excluir projeto.");
      } else {
        const currentId = projectId;
        resetProjectForm();
        await refreshProjects(companyId);
        if (currentId === projectId) setProjectId("");
      }
    } catch {
      setError("Falha ao comunicar com a API.");
    } finally {
      setLoading(false);
    }
  }

  async function postAndReload(path: string, body: any) {
    const token = getToken();
    if (!token || !projectId) return;
    setLoading(true); setError(null);
    try {
      const r = await apiPost<{ ok: boolean; error?: string }>(path, token, body);
      if (!r?.ok) throw new Error(r?.error || "Falha na operação.");
      await loadProject(projectId);
    } catch (err: any) { setError(err?.message || "Falha na operação."); } finally { setLoading(false); }
  }

  async function putAndReload(path: string, body: any) {
    const token = getToken();
    if (!token || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await apiPut<{ ok: boolean; error?: string }>(path, token, body);
      if (!r?.ok) throw new Error(r?.error || "Falha na operação.");
      await loadProject(projectId);
    } catch (err: any) {
      setError(err?.message || "Falha na operação.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteAndReload(path: string, confirmMessage: string) {
    const token = getToken();
    if (!token || !projectId) return;
    if (!window.confirm(confirmMessage)) return;
    setLoading(true);
    setError(null);
    try {
      const r = await apiDelete<{ ok: boolean; error?: string }>(path, token);
      if (!r?.ok) throw new Error(r?.error || "Falha na operação.");
      await loadProject(projectId);
    } catch (err: any) {
      setError(err?.message || "Falha na operação.");
    } finally {
      setLoading(false);
    }
  }

  function generateStrongPassword(length = 9) {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghijkmnopqrstuvwxyz";
    const numbers = "23456789";
    const special = "!@#$%&*?";
    const all = `${upper}${lower}${numbers}${special}`;
    const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
    const chars = [pick(upper), pick(lower), pick(numbers), pick(special)];
    while (chars.length < length) chars.push(pick(all));
    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join("");
  }

  function csvEscape(value: string) {
    const text = String(value ?? "");
    if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function parseCsv(content: string) {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentValue = "";
    let insideQuotes = false;

    for (let i = 0; i < content.length; i += 1) {
      const char = content[i];
      const nextChar = content[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentValue += '"';
          i += 1;
        } else {
          insideQuotes = !insideQuotes;
        }
        continue;
      }

      if (char === "," && !insideQuotes) {
        currentRow.push(currentValue);
        currentValue = "";
        continue;
      }

      if ((char === "\n" || char === "\r") && !insideQuotes) {
        if (char === "\r" && nextChar === "\n") i += 1;
        currentRow.push(currentValue);
        rows.push(currentRow);
        currentRow = [];
        currentValue = "";
        continue;
      }

      currentValue += char;
    }

    if (currentValue.length > 0 || currentRow.length > 0) {
      currentRow.push(currentValue);
      rows.push(currentRow);
    }

    return rows;
  }

  function sanitizeName(raw: string) {
    return String(raw || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toUpperCase();
  }

  const groupsForSelect = useMemo(() => [...groups].sort((a, b) => a.name.localeCompare(b.name)), [groups]);
  const fileServerAccessGroups = useMemo(
    () => groupsForSelect.filter((group) => group.kind === "GA" && group.name.startsWith("GA_")),
    [groupsForSelect],
  );
  const gaGroupIdByName = useMemo(
    () => new Map(fileServerAccessGroups.map((group) => [group.name.toLowerCase(), group.id])),
    [fileServerAccessGroups],
  );
  const usersByUsername = useMemo(
    () => new Map(users.map((user) => [user.username.toLowerCase(), user])),
    [users],
  );
  const availableUserGaGroups = useMemo(
    () => fileServerAccessGroups.filter((group) => !uGroupIds.includes(group.id)),
    [fileServerAccessGroups, uGroupIds],
  );
  const selectedUserGaGroups = useMemo(
    () => fileServerAccessGroups.filter((group) => uGroupIds.includes(group.id)),
    [fileServerAccessGroups, uGroupIds],
  );
  const orgTree = useMemo<OrgTreeNode[]>(() => {
    const map = new Map<string, OrgTreeNode>();
    for (const node of orgNodes) map.set(node.id, { ...node, children: [] });
    const roots: OrgTreeNode[] = [];
    for (const node of map.values()) {
      if (node.parentId && map.has(node.parentId)) map.get(node.parentId)!.children.push(node);
      else roots.push(node);
    }
    const sortNodes = (items: OrgTreeNode[]) => {
      items.sort((a, b) => a.name.localeCompare(b.name));
      items.forEach((item) => sortNodes(item.children));
    };
    sortNodes(roots);
    return roots;
  }, [orgNodes]);
  const orgPathById = useMemo(() => {
    const pathMap = new Map<string, string>();
    const visit = (nodes: OrgTreeNode[], parentParts: string[] = []) => {
      for (const node of nodes) {
        const currentParts = [...parentParts, node.name];
        pathMap.set(node.id, currentParts.join(" / "));
        visit(node.children, currentParts);
      }
    };
    visit(orgTree);
    return pathMap;
  }, [orgTree]);
  const orgSelectOptions = useMemo(() => {
    const options: Array<{ id: string; label: string }> = [];
    const visit = (nodes: OrgTreeNode[], depth = 0, parentParts: string[] = []) => {
      for (const node of nodes) {
        const currentParts = [...parentParts, node.name];
        const prefix = depth > 0 ? `${"|- ".repeat(depth)}` : "";
        const pathLabel = currentParts.join(" / ");
        options.push({
          id: node.id,
          label: depth > 0 ? `${prefix}${node.name} (${pathLabel})` : node.name,
        });
        visit(node.children, depth + 1, currentParts);
      }
    };
    visit(orgTree);
    return options;
  }, [orgTree]);
  const selectedUserOrgPath = useMemo(() => (uOrgId ? orgPathById.get(uOrgId) || "" : ""), [uOrgId, orgPathById]);
  const orgIdByPath = useMemo(
    () => new Map(Array.from(orgPathById.entries()).map(([id, path]) => [path.toLowerCase(), id])),
    [orgPathById],
  );
  const selectedOrg = useMemo(() => orgNodes.find((node) => node.id === selectedOrgId) || null, [orgNodes, selectedOrgId]);
  const filteredGroups = useMemo(
    () => groupsForSelect.filter((group) => !groupSearch || group.name.toLowerCase().includes(groupSearch.toLowerCase()) || group.kind.toLowerCase().includes(groupSearch.toLowerCase())),
    [groupsForSelect, groupSearch],
  );
  const folderMap = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
  const folderTree = useMemo<FolderTreeNode[]>(() => {
    const map = new Map<string, FolderTreeNode>();
    for (const folder of folders) map.set(folder.id, { ...folder, children: [] });
    const roots: FolderTreeNode[] = [];
    for (const node of map.values()) {
      if (node.parentId && map.has(node.parentId)) map.get(node.parentId)!.children.push(node);
      else roots.push(node);
    }
    const sortNodes = (items: FolderTreeNode[]) => {
      items.sort((a, b) => a.name.localeCompare(b.name));
      items.forEach((item) => sortNodes(item.children));
    };
    sortNodes(roots);
    return roots;
  }, [folders]);
  const selectedFolder = useMemo(() => folders.find((folder) => folder.id === selectedFolderId) || null, [folders, selectedFolderId]);
  function getFolderPathParts(folderId?: string | null, extraName?: string) {
    const parts: string[] = [];
    let currentId = folderId || null;
    while (currentId) {
      const current = folderMap.get(currentId);
      if (!current) break;
      parts.unshift(current.name);
      currentId = current.parentId || null;
    }
    if (extraName) parts.push(extraName);
    return parts;
  }
  function getFolderGroupBase(folderId?: string | null, extraName?: string) {
    return sanitizeName(getFolderPathParts(folderId, extraName).join("_"));
  }
  const selectedFolderBase = useMemo(() => selectedFolder ? getFolderGroupBase(selectedFolder.id) : "", [selectedFolder, folderMap]);
  const selectedFolderLegacyBase = useMemo(() => selectedFolder ? sanitizeName(selectedFolder.name) : "", [selectedFolder]);
  const selectedFolderGroups = useMemo(() => {
    if (!selectedFolder) return [] as Group[];
    const appliedIds = new Set(selectedFolder.permissions.map((permission) => permission.group.id));
    return [...groups]
      .filter((group) =>
        appliedIds.has(group.id) ||
        group.name === `GF_${selectedFolderBase}` ||
        group.name.startsWith(`GA_${selectedFolderBase}_`) ||
        group.name === `GF_${selectedFolderLegacyBase}` ||
        group.name.startsWith(`GA_${selectedFolderLegacyBase}_`)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [groups, selectedFolder, selectedFolderBase, selectedFolderLegacyBase]);

  useEffect(() => {
    setExpandedFolderIds(folders.map((folder) => folder.id));
    if (selectedFolderId && !folders.some((folder) => folder.id === selectedFolderId)) setSelectedFolderId("");
  }, [folders]);

  useEffect(() => {
    if (selectedFolderId) {
      setEditFolderName(selectedFolder?.name || "");
      setEditFolderInheritance(selectedFolder?.disableInheritance ?? true);
    } else {
      setEditFolderName("");
    }
    setEditingGroupId("");
    setEditingGroupName("");
  }, [selectedFolderId, selectedFolder]);

  useEffect(() => {
    const group = groups.find((item) => item.id === editingGroupId);
    if (group) {
      setEditingGroupName(group.name);
      setEditingGroupPermission(group.permission || "L");
    }
  }, [editingGroupId, groups]);

  useEffect(() => {
    if (!editingGroupId) {
      setGroupDependencies(null);
      return;
    }
    const token = getToken();
    if (!token) return;
    (async () => {
      const response = await apiGet<{ ok: boolean; data?: GroupDependency; error?: string }>(`/adfs/groups/${editingGroupId}/dependencies`, token);
      if (response?.ok) setGroupDependencies(response.data || null);
      else setGroupDependencies(null);
    })();
  }, [editingGroupId]);

  function toggleFolder(id: string) {
    setExpandedFolderIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function ensureGroup(projectIdValue: string, kind: "GF" | "GA", name: string, permission?: string) {
    const token = getToken();
    if (!token) throw new Error("Sessão expirada.");
    const existing = groups.find((group) => group.name === name);
    if (existing) return existing.id;
    const response = await apiPost<{ ok: boolean; data?: Group; error?: string }>("/adfs/groups", token, {
      projectId: projectIdValue,
      kind,
      name,
      permission: kind === "GA" ? permission : undefined,
    });
    if (!response?.ok || !response.data?.id) throw new Error(response?.error || `Falha ao criar grupo ${name}.`);
    return response.data.id;
  }

  async function ensureFolderPermission(folderId: string, groupId: string, permission: string, currentFolder?: Folder | null) {
    const token = getToken();
    if (!token) throw new Error("Sessão expirada.");
    const exists = currentFolder?.permissions.some((item) => item.group.id === groupId && item.permission === permission);
    if (exists) return;
    const response = await apiPost<{ ok: boolean; error?: string }>("/adfs/folder-permissions", token, { folderNodeId: folderId, groupId, permission });
    if (!response?.ok) throw new Error(response?.error || "Falha ao aplicar permissão.");
  }

  async function createFolderWithGroups() {
    const token = getToken();
    if (!token || !projectId || !fName) return;
    setLoading(true);
    setError(null);
    try {
      if (selectedFolder && ensureParentGf) {
        const parentGfName = `GF_${getFolderGroupBase(selectedFolder.id)}`;
        const parentGfId = await ensureGroup(projectId, "GF", parentGfName);
        await ensureFolderPermission(selectedFolder.id, parentGfId, "L", selectedFolder);
      }

      const folderResponse = await apiPost<{ ok: boolean; data?: Folder; error?: string }>("/adfs/folders", token, {
        projectId,
        parentId: selectedFolderId || undefined,
        name: fName,
        disableInheritance: fDisableInheritance,
      });
      if (!folderResponse?.ok || !folderResponse.data?.id) throw new Error(folderResponse?.error || "Falha ao criar pasta.");

      const createdFolder = folderResponse.data;
      const base = getFolderGroupBase(selectedFolderId || null, fName);
      if (newFolderCreateGf) {
        const gfId = await ensureGroup(projectId, "GF", `GF_${base}`);
        await ensureFolderPermission(createdFolder.id, gfId, "L");
      }
      if (newFolderCreateL) {
        const groupId = await ensureGroup(projectId, "GA", `GA_${base}_L`, "L");
        await ensureFolderPermission(createdFolder.id, groupId, "L");
      }
      if (newFolderCreateLg) {
        const groupId = await ensureGroup(projectId, "GA", `GA_${base}_LG`, "LG");
        await ensureFolderPermission(createdFolder.id, groupId, "LG");
      }
      if (newFolderCreateFull) {
        const groupId = await ensureGroup(projectId, "GA", `GA_${base}_FULL`, "FULL");
        await ensureFolderPermission(createdFolder.id, groupId, "FULL");
      }

      setFName("");
      await loadProject(projectId);
      setSelectedFolderId(createdFolder.id);
    } catch (err: any) {
      setError(err?.message || "Falha ao criar pasta.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSelectedFolder() {
    const token = getToken();
    if (!token || !selectedFolderId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiPut<{ ok: boolean; error?: string }>(`/adfs/folders/${selectedFolderId}`, token, {
        name: editFolderName,
        disableInheritance: editFolderInheritance,
      });
      if (!response?.ok) throw new Error(response?.error || "Falha ao atualizar pasta.");
      await loadProject(projectId);
    } catch (err: any) {
      setError(err?.message || "Falha ao atualizar pasta.");
    } finally {
      setLoading(false);
    }
  }

  async function removeSelectedFolder() {
    const token = getToken();
    if (!token || !selectedFolderId) return;
    if (!window.confirm("Excluir a pasta selecionada e toda a sua estrutura?")) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiDelete<{ ok: boolean; error?: string }>(`/adfs/folders/${selectedFolderId}`, token);
      if (!response?.ok) throw new Error(response?.error || "Falha ao excluir pasta.");
      setSelectedFolderId("");
      await loadProject(projectId);
    } catch (err: any) {
      setError(err?.message || "Falha ao excluir pasta.");
    } finally {
      setLoading(false);
    }
  }

  async function saveGroup() {
    const token = getToken();
    if (!token || !editingGroupId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiPut<{ ok: boolean; error?: string }>(`/adfs/groups/${editingGroupId}`, token, {
        name: editingGroupName,
        permission: editingGroupPermission || null,
      });
      if (!response?.ok) throw new Error(response?.error || "Falha ao atualizar grupo.");
      const deps = await apiGet<{ ok: boolean; data?: GroupDependency; error?: string }>(`/adfs/groups/${editingGroupId}/dependencies`, token);
      if (deps?.ok) setGroupDependencies(deps.data || null);
      await loadProject(projectId);
    } catch (err: any) {
      setError(err?.message || "Falha ao atualizar grupo.");
    } finally {
      setLoading(false);
    }
  }

  async function removeGroup(groupId: string, force = false) {
    const token = getToken();
    if (!token) return;
    if (!window.confirm(force ? "Excluir este grupo removendo também os vínculos e dependências?" : "Excluir este grupo?")) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiDelete<{ ok: boolean; error?: string }>(`/adfs/groups/${groupId}${force ? "?force=true" : ""}`, token);
      if (!response?.ok) throw new Error(response?.error || "Falha ao excluir grupo.");
      setEditingGroupId("");
      setGroupDependencies(null);
      await loadProject(projectId);
    } catch (err: any) {
      setError(err?.message || "Falha ao excluir grupo.");
    } finally {
      setLoading(false);
    }
  }

  function selectGroup(groupId: string) {
    setEditingGroupId(groupId);
  }

  async function removePermission(permissionId: string) {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiDelete<{ ok: boolean; error?: string }>(`/adfs/folder-permissions/${permissionId}`, token);
      if (!response?.ok) throw new Error(response?.error || "Falha ao excluir permissão.");
      await loadProject(projectId);
    } catch (err: any) {
      setError(err?.message || "Falha ao excluir permissão.");
    } finally {
      setLoading(false);
    }
  }

  function resetOrgForm() {
    setOrgName("");
  }

  async function submitOrgNode() {
    if (!orgName) return;
    await postAndReload('/adfs/org-nodes', { projectId, parentId: selectedOrgId || undefined, name: orgName });
    resetOrgForm();
  }

  useEffect(() => {
    if (selectedOrg) {
      setEditOrgName(selectedOrg.name);
      setExpandedOrgIds((current) => current.includes(selectedOrg.id) ? current : [...current, selectedOrg.id]);
    } else {
      setEditOrgName("");
    }
  }, [selectedOrg]);

  function toggleOrg(nodeId: string) {
    setExpandedOrgIds((current) => current.includes(nodeId) ? current.filter((id) => id !== nodeId) : [...current, nodeId]);
  }

  async function saveSelectedOrg() {
    if (!selectedOrg || !editOrgName) return;
    await putAndReload(`/adfs/org-nodes/${selectedOrg.id}`, {
      parentId: selectedOrg.parentId || null,
      name: editOrgName,
    });
  }

  async function removeSelectedOrg() {
    if (!selectedOrg) return;
    await deleteAndReload(`/adfs/org-nodes/${selectedOrg.id}`, "Excluir este item da estrutura organizacional?");
    setSelectedOrgId("");
  }

  function startEditUser(user: UserPlan) {
    setEditingUserId(user.id);
    setUFullName(user.fullName);
    setUFirstName(user.firstName);
    setULastName(user.lastName || "");
    setUUsername(user.username);
    setUEmail(user.email || "");
    setUTitle(user.title || "");
    setUPasswordMode("FIXED");
    setUInitialPassword(user.initialPassword || generateStrongPassword());
    setUGroupIds(user.groups.filter((group) => group.kind === "GA" && group.name.startsWith("GA_")).map((group) => group.id));
    setUHiddenGroupIds(user.groups.filter((group) => !(group.kind === "GA" && group.name.startsWith("GA_"))).map((group) => group.id));
    setUOrgId(user.orgNode?.id || "");
  }

  function resetUserForm() {
    setEditingUserId("");
    setUFullName("");
    setUFirstName("");
    setULastName("");
    setUUsername("");
    setUEmail("");
    setUTitle("");
    setUPasswordMode("RANDOM");
    setUInitialPassword(generateStrongPassword());
    setUGroupIds([]);
    setUHiddenGroupIds([]);
    setUOrgId("");
  }

  async function submitUser() {
    if (!uFullName || !uFirstName || !uUsername) return;
    if (uPasswordMode === "FIXED" && !uInitialPassword) {
      setError("Informe a senha padrão do usuário.");
      return;
    }
    const body = {
      projectId,
      orgNodeId: uOrgId || null,
      fullName: uFullName,
      firstName: uFirstName,
      lastName: uLastName || null,
      username: uUsername,
      email: uEmail || null,
      title: uTitle || null,
      initialPassword: uInitialPassword || null,
      groupIds: [...uHiddenGroupIds, ...uGroupIds],
    };
    if (editingUserId) await putAndReload(`/adfs/users/${editingUserId}`, body);
    else await postAndReload('/adfs/users', body);
    resetUserForm();
  }

  function addUserGroup(groupId: string) {
    setUGroupIds((current) => current.includes(groupId) ? current : [...current, groupId]);
  }

  function removeUserGroup(groupId: string) {
    setUGroupIds((current) => current.filter((id) => id !== groupId));
  }

  function changeUserPasswordMode(mode: "RANDOM" | "FIXED") {
    setUPasswordMode(mode);
    if (mode === "RANDOM") setUInitialPassword(generateStrongPassword());
  }

  function regenerateUserPassword() {
    setUInitialPassword(generateStrongPassword());
  }

  function exportUsersCsv() {
    if (!projectId) return;
    const headers = ["fullName", "firstName", "lastName", "username", "email", "title", "sectorPath", "password", "gaGroups"];
    const rows = users.map((user) => {
      const gaGroups = user.groups
        .filter((group) => group.kind === "GA" && group.name.startsWith("GA_"))
        .map((group) => group.name)
        .join("|");
      return [
        user.fullName,
        user.firstName,
        user.lastName || "",
        user.username,
        user.email || "",
        user.title || "",
        user.orgNode ? orgPathById.get(user.orgNode.id) || user.orgNode.name : "",
        user.initialPassword || "",
        gaGroups,
      ];
    });
    const csv = [headers, ...rows].map((row) => row.map((value) => csvEscape(String(value || ""))).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usuarios_planejados_${(selectedProject?.name || "projeto").replace(/\s+/g, "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function importUsersCsv(file?: File | null) {
    const token = getToken();
    if (!token || !projectId || !file) return;
    setLoading(true);
    setError(null);
    try {
      const content = await file.text();
      const rows = parseCsv(content).filter((row) => row.some((cell) => String(cell || "").trim()));
      if (rows.length < 2) throw new Error("O CSV nao possui linhas de usuarios para importar.");

      const headers = rows[0].map((header) => String(header || "").trim());
      const headerMap = new Map(headers.map((header, index) => [header, index]));
      const requiredHeaders = ["fullName", "firstName", "username"];
      for (const header of requiredHeaders) {
        if (!headerMap.has(header)) throw new Error(`Coluna obrigatoria ausente no CSV: ${header}`);
      }

      const getCell = (row: string[], header: string) => {
        const index = headerMap.get(header);
        return index === undefined ? "" : String(row[index] || "").trim();
      };

      const operations = rows.slice(1).map((row, rowIndex) => {
        const fullName = getCell(row, "fullName");
        const firstName = getCell(row, "firstName");
        const lastName = getCell(row, "lastName");
        const username = getCell(row, "username");
        const email = getCell(row, "email");
        const title = getCell(row, "title");
        const sectorPath = getCell(row, "sectorPath");
        const password = getCell(row, "password") || generateStrongPassword();
        const gaGroups = getCell(row, "gaGroups")
          .split(/[|;]/)
          .map((item) => item.trim())
          .filter(Boolean);

        if (!fullName || !firstName || !username) {
          throw new Error(`Linha ${rowIndex + 2}: preencha fullName, firstName e username.`);
        }

        const orgNodeId = sectorPath ? orgIdByPath.get(sectorPath.toLowerCase()) : undefined;
        if (sectorPath && !orgNodeId) {
          throw new Error(`Linha ${rowIndex + 2}: setor nao encontrado: ${sectorPath}`);
        }

        const gaGroupIds = gaGroups.map((groupName) => {
          const groupId = gaGroupIdByName.get(groupName.toLowerCase());
          if (!groupId) throw new Error(`Linha ${rowIndex + 2}: grupo GA nao encontrado: ${groupName}`);
          return groupId;
        });

        const existingUser = usersByUsername.get(username.toLowerCase());
        const hiddenGroupIds = existingUser
          ? existingUser.groups.filter((group) => !(group.kind === "GA" && group.name.startsWith("GA_"))).map((group) => group.id)
          : [];

        return {
          existingUserId: existingUser?.id,
          body: {
            projectId,
            orgNodeId: orgNodeId || null,
            fullName,
            firstName,
            lastName: lastName || null,
            username,
            email: email || null,
            title: title || null,
            initialPassword: password,
            groupIds: [...hiddenGroupIds, ...gaGroupIds],
          },
        };
      });

      let created = 0;
      let updated = 0;
      for (const operation of operations) {
        if (operation.existingUserId) {
          const response = await apiPut<{ ok: boolean; error?: string }>(`/adfs/users/${operation.existingUserId}`, token, operation.body);
          if (!response?.ok) throw new Error(response?.error || `Falha ao atualizar usuario ${operation.body.username}.`);
          updated += 1;
        } else {
          const response = await apiPost<{ ok: boolean; error?: string }>(`/adfs/users`, token, operation.body);
          if (!response?.ok) throw new Error(response?.error || `Falha ao criar usuario ${operation.body.username}.`);
          created += 1;
        }
      }

      await loadProject(projectId);
      window.alert(`Importacao concluida. Criados: ${created}. Atualizados: ${updated}.`);
    } catch (err: any) {
      setError(err?.message || "Falha ao importar CSV de usuarios.");
    } finally {
      setLoading(false);
      if (userImportInputRef.current) userImportInputRef.current.value = "";
    }
  }

  function renderOrgTree(nodes: OrgTreeNode[], depth = 0): React.ReactNode {
    return nodes.map((node) => {
      const expanded = expandedOrgIds.includes(node.id);
      const selected = selectedOrgId === node.id;
      return (
        <div key={node.id}>
          <div
            className={`flex items-center gap-2 rounded px-2 py-1 cursor-pointer border ${selected ? "bg-blue-50 border-blue-300" : "border-transparent hover:bg-gray-50"}`}
            style={{ marginLeft: depth * 16 }}
            onClick={() => setSelectedOrgId((current) => current === node.id ? "" : node.id)}
          >
            <button
              type="button"
              className="w-5 text-xs text-gray-600"
              onClick={(e) => {
                e.stopPropagation();
                if (node.children.length) toggleOrg(node.id);
              }}
            >
              {node.children.length ? (expanded ? "▾" : "▸") : "•"}
            </button>
            <span className="font-medium">{node.name}</span>
          </div>
          {expanded && node.children.length > 0 ? renderOrgTree(node.children, depth + 1) : null}
        </div>
      );
    });
  }

  function renderFolderTree(nodes: FolderTreeNode[], depth = 0): React.ReactNode {
    return nodes.map((node) => {
      const expanded = expandedFolderIds.includes(node.id);
      const selected = selectedFolderId === node.id;
      return (
        <div key={node.id}>
          <div
            className={`flex items-center gap-2 rounded px-2 py-1 cursor-pointer border ${selected ? "bg-blue-50 border-blue-300" : "border-transparent hover:bg-gray-50"}`}
            style={{ marginLeft: depth * 16 }}
            onClick={() => setSelectedFolderId((current) => current === node.id ? "" : node.id)}
          >
            <button
              type="button"
              className="w-5 text-xs text-gray-600"
              onClick={(e) => {
                e.stopPropagation();
                if (node.children.length) toggleFolder(node.id);
              }}
            >
              {node.children.length ? (expanded ? "▾" : "▸") : "•"}
            </button>
            <span className="font-medium">{node.name}</span>
            {node.disableInheritance && <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">Herança off</span>}
          </div>
          {expanded && node.children.length > 0 ? renderFolderTree(node.children, depth + 1) : null}
        </div>
      );
    });
  }

  return (
    <main>
      <h1 className="text-2xl font-semibold">AD / File Server — Planejador V1</h1>
      <p className="mt-2 text-sm text-gray-700">Planeje estrutura organizacional, usuários, grupos, pastas, permissões e GPO; gere o script PowerShell ao final.</p>

      {error && <p className="mt-3 text-sm text-error">{error}</p>}

      <div className="mt-4 p-4 bg-card border border-border rounded shadow">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold">Projeto</h2>
            <p className="text-sm text-gray-600">Crie, selecione, edite ou exclua o projeto logo no início do planejamento.</p>
          </div>
          <div className="text-sm border rounded px-3 py-2 bg-gray-50">
            <strong>Modo:</strong> {projectId ? "Editando projeto existente" : "Novo projeto"}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-sm">Empresa</label>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="w-full px-3 py-2 border rounded">
              {companies.map((c) => <option key={c.id} value={c.id}>{c.fantasyName || c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm">Projeto</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full px-3 py-2 border rounded">
              <option value="">—</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm">Nome do projeto</label>
            <input value={pName} onChange={(e) => setPName(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>
          <div className="flex gap-2">
            <button onClick={submitProject} disabled={loading || !companyId || !pName} className={`px-3 py-2 rounded ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} text-white`}>
              {projectId ? "Salvar projeto" : "Criar projeto"}
            </button>
            <button onClick={resetProjectForm} className="px-3 py-2 rounded border hover:bg-gray-50" disabled={loading}>Novo</button>
            {projectId && <button onClick={removeProject} className="px-3 py-2 rounded border hover:bg-gray-50" disabled={loading}>Excluir</button>}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-sm">Domínio</label>
            <input value={pDomain} onChange={(e) => setPDomain(e.target.value)} className="w-full px-3 py-2 border rounded" placeholder="ex.: empresa.local" />
          </div>
          <div>
            <label className="text-sm">OU Raiz</label>
            <input value={pRootOu} onChange={(e) => setPRootOu(e.target.value)} className="w-full px-3 py-2 border rounded" placeholder="ex.: DELPI" />
          </div>
          <div>
            <label className="text-sm">Root path</label>
            <input value={pRoot} onChange={(e) => setPRoot(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>
          <div className="text-sm text-gray-600 border rounded px-3 py-2 bg-gray-50">
            A estrutura organizacional sera criada no AD em `OU=SETORES,OU={pRootOu || "OU_RAIZ"},DC=...` e os grupos `GF_` e `GA_` em `OU=FILESERVER,OU={pRootOu || "OU_RAIZ"},DC=...`
          </div>
        </div>
      </div>

      {projectId && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-6">
            <section className="p-4 bg-card border border-border rounded shadow space-y-3">
              <h2 className="font-semibold">Estrutura Organizacional</h2>
              <p className="text-sm text-gray-600">Visualize a estrutura em arvore, selecione um nivel e trabalhe o contexto no painel lateral.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded p-2 max-h-96 overflow-auto">
                  {orgTree.length ? renderOrgTree(orgTree) : <div className="text-sm text-gray-500">Nenhum item cadastrado ainda.</div>}
                </div>
                <div className="space-y-3">
                  <div className="text-sm border rounded p-3 space-y-2">
                    <div><strong>Contexto atual:</strong> {selectedOrg ? selectedOrg.name : "Raiz da estrutura"}</div>
                    {selectedOrg && (
                      <button onClick={() => setSelectedOrgId("")} className="text-xs px-2 py-1 rounded border hover:bg-gray-50" type="button">
                        Deselecionar item
                      </button>
                    )}
                    {selectedOrg && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t">
                        <input value={editOrgName} onChange={(e) => setEditOrgName(e.target.value)} className="px-3 py-2 border rounded" placeholder="Nome do item" />
                        <button onClick={saveSelectedOrg} className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white" disabled={!editOrgName || loading}>Salvar item</button>
                        <button onClick={removeSelectedOrg} className="px-3 py-2 rounded bg-red-600 hover:bg-red-700 text-white" disabled={loading}>Excluir item</button>
                      </div>
                    )}
                  </div>

                  <div className="border rounded p-3 space-y-3">
                    <div className="font-semibold text-sm">Novo item da estrutura</div>
                    <input value={orgName} onChange={(e) => setOrgName(e.target.value)} className="px-3 py-2 border rounded" placeholder={selectedOrg ? "Nome do filho" : "Nome do item raiz"} />
                    <div className="text-sm text-gray-600">
                      {selectedOrg ? `Sera criado abaixo de ${selectedOrg.name}.` : "Sera criado na raiz da estrutura organizacional."}
                    </div>
                    <button onClick={submitOrgNode} className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white" disabled={!orgName || loading}>Criar na estrutura</button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6">
            <section className="p-4 bg-card border border-border rounded shadow space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Usuários Planejados</h2>
                <div className="flex gap-2">
                  <button onClick={exportUsersCsv} type="button" className="px-3 py-2 rounded border hover:bg-gray-50" disabled={!projectId || loading}>
                    Exportar CSV
                  </button>
                  <button onClick={() => userImportInputRef.current?.click()} type="button" className="px-3 py-2 rounded border hover:bg-gray-50" disabled={!projectId || loading}>
                    Importar CSV
                  </button>
                  <input
                    ref={userImportInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => importUsersCsv(e.target.files?.[0])}
                  />
                </div>
              </div>
              <div className="text-xs text-gray-600 border rounded px-3 py-2 bg-gray-50">
                CSV: `fullName`, `firstName`, `lastName`, `username`, `email`, `title`, `sectorPath`, `password`, `gaGroups`. Em `gaGroups`, separe os grupos por `|`.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input value={uFullName} onChange={(e) => setUFullName(e.target.value)} className="px-3 py-2 border rounded" placeholder="Nome completo" />
                <input value={uFirstName} onChange={(e) => setUFirstName(e.target.value)} className="px-3 py-2 border rounded" placeholder="Primeiro nome" />
                <input value={uLastName} onChange={(e) => setULastName(e.target.value)} className="px-3 py-2 border rounded" placeholder="Sobrenome" />
                <input value={uUsername} onChange={(e) => setUUsername(e.target.value)} className="px-3 py-2 border rounded" placeholder="Login" />
                <input value={uEmail} onChange={(e) => setUEmail(e.target.value)} className="px-3 py-2 border rounded" placeholder="Email" />
                <input value={uTitle} onChange={(e) => setUTitle(e.target.value)} className="px-3 py-2 border rounded" placeholder="Cargo" />
                <select value={uPasswordMode} onChange={(e) => changeUserPasswordMode(e.target.value as "RANDOM" | "FIXED")} className="px-3 py-2 border rounded">
                  <option value="RANDOM">Senha aleatoria forte (9 caracteres)</option>
                  <option value="FIXED">Senha padrao definida na interface</option>
                </select>
                {uPasswordMode === "FIXED" ? (
                  <input value={uInitialPassword} onChange={(e) => setUInitialPassword(e.target.value)} className="px-3 py-2 border rounded" placeholder="Senha padrao" />
                ) : (
                  <div className="flex gap-2">
                    <input value={uInitialPassword} readOnly className="flex-1 px-3 py-2 border rounded bg-gray-50 text-sm" placeholder="Senha gerada" />
                    <button type="button" onClick={regenerateUserPassword} className="px-3 py-2 rounded border hover:bg-gray-50">
                      Gerar outra
                    </button>
                  </div>
                )}
                <select value={uOrgId} onChange={(e) => setUOrgId(e.target.value)} className="px-3 py-2 border rounded">
                  <option value="">Setor</option>
                  {orgSelectOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
                <div className="md:col-span-3 text-xs text-gray-600 border rounded px-3 py-2 bg-gray-50">
                  {selectedUserOrgPath ? `Setor selecionado: ${selectedUserOrgPath}` : "Selecione o setor pela estrutura em arvore para evitar confusao entre nomes iguais."}
                </div>
              </div>
              <div className="border rounded p-3 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">Acessos do File Server</span>
                  <button onClick={() => setUGroupIds([])} className="text-xs px-2 py-1 rounded border hover:bg-gray-50" type="button" disabled={!uGroupIds.length}>Remover todos</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="border rounded p-2 space-y-2">
                    <div className="font-semibold text-xs uppercase tracking-wide text-gray-600">Nao faz parte</div>
                    <div className="max-h-48 overflow-auto space-y-1">
                      {availableUserGaGroups.length ? (
                        availableUserGaGroups.map((group) => (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => addUserGroup(group.id)}
                            className="w-full text-left text-xs px-2 py-1 rounded border hover:bg-gray-50"
                          >
                            + {group.name}
                          </button>
                        ))
                      ) : (
                        <div className="text-gray-500">Nenhum GA disponivel.</div>
                      )}
                    </div>
                  </div>
                  <div className="border rounded p-2 space-y-2">
                    <div className="font-semibold text-xs uppercase tracking-wide text-gray-600">Faz parte</div>
                    <div className="max-h-48 overflow-auto space-y-1">
                      {selectedUserGaGroups.length ? (
                        selectedUserGaGroups.map((group) => (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => removeUserGroup(group.id)}
                            className="w-full text-left text-xs px-2 py-1 rounded border bg-gray-50 hover:bg-gray-100"
                          >
                            - {group.name}
                          </button>
                        ))
                      ) : (
                        <div className="text-gray-500">Nenhum GA vinculado.</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-600 border rounded px-3 py-2 bg-gray-50">
                  Somente grupos `GA_` aparecem aqui. {uHiddenGroupIds.length ? `Outros vinculos do usuario serao preservados automaticamente (${uHiddenGroupIds.length}).` : "Os demais grupos nao sao alterados por este bloco."}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={submitUser} className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white" disabled={!uFullName || !uFirstName || !uUsername || loading}>{editingUserId ? "Salvar edição" : "Adicionar usuário"}</button>
                {editingUserId && <button onClick={resetUserForm} className="px-3 py-2 rounded border" disabled={loading}>Cancelar</button>}
              </div>
              <div className="text-sm max-h-48 overflow-auto border rounded p-2 space-y-2">
                {users.map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-2 border rounded px-2 py-1">
                    <span>{u.fullName} ({u.username}){u.orgNode ? ` - ${orgPathById.get(u.orgNode.id) || u.orgNode.name}` : ""}</span>
                    <div className="flex gap-2">
                      <button onClick={() => startEditUser(u)} className="text-xs px-2 py-1 rounded border hover:bg-gray-50">Editar</button>
                      <button onClick={() => deleteAndReload(`/adfs/users/${u.id}`, "Excluir este usuário planejado?")} className="text-xs px-2 py-1 rounded border hover:bg-gray-50">Excluir</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6">
            <section className="p-4 bg-card border border-border rounded shadow space-y-3">
              <h2 className="font-semibold">Estrutura de Pastas, Grupos e Permissões</h2>
              <p className="text-sm text-gray-600">Selecione uma pasta na árvore e trabalhe tudo no mesmo contexto: criar subpastas, gerar grupos GF/GA, aplicar permissões e editar a estrutura.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded p-2 max-h-96 overflow-auto">
                  {folderTree.length ? renderFolderTree(folderTree) : <div className="text-sm text-gray-500">Nenhuma pasta criada ainda.</div>}
                </div>
                <div className="space-y-3">
                  <div className="text-sm border rounded p-3 space-y-2">
                    <div><strong>Contexto atual:</strong> {selectedFolder ? selectedFolder.name : "Raiz do File Server"}</div>
                    <div><strong>Herança atual:</strong> {selectedFolder ? (selectedFolder.disableInheritance ? "desabilitada" : "habilitada") : "-"}</div>
                    {selectedFolder && (
                      <button onClick={() => setSelectedFolderId("")} className="text-xs px-2 py-1 rounded border hover:bg-gray-50" type="button">
                        Deselecionar pasta
                      </button>
                    )}
                    {selectedFolder && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t">
                        <input value={editFolderName} onChange={(e) => setEditFolderName(e.target.value)} className="px-3 py-2 border rounded" placeholder="Nome da pasta" />
                        <label className="flex items-center gap-2 text-sm px-2"><input type="checkbox" checked={editFolderInheritance} onChange={(e) => setEditFolderInheritance(e.target.checked)} />Desabilitar herança</label>
                        <button onClick={saveSelectedFolder} className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white" disabled={!editFolderName || loading}>Salvar pasta</button>
                        <button onClick={removeSelectedFolder} className="px-3 py-2 rounded bg-red-600 hover:bg-red-700 text-white" disabled={loading}>Excluir pasta</button>
                      </div>
                    )}
                  </div>

                  <div className="border rounded p-3 space-y-3">
                    <div className="font-semibold text-sm">Nova pasta / subpasta</div>
                    <input value={fName} onChange={(e) => setFName(e.target.value)} className="px-3 py-2 border rounded" placeholder="Nome da nova pasta" />
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fDisableInheritance} onChange={(e) => setFDisableInheritance(e.target.checked)} />Desabilitar herança</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={newFolderCreateGf} onChange={(e) => setNewFolderCreateGf(e.target.checked)} />Criar GF da pasta</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={newFolderCreateL} onChange={(e) => setNewFolderCreateL(e.target.checked)} />Criar GA leitura</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={newFolderCreateLg} onChange={(e) => setNewFolderCreateLg(e.target.checked)} />Criar GA leitura/gravação</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={newFolderCreateFull} onChange={(e) => setNewFolderCreateFull(e.target.checked)} />Criar GA completo</label>
                    </div>
                    {selectedFolder && (
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ensureParentGf} onChange={(e) => setEnsureParentGf(e.target.checked)} />Garantir GF na pasta pai selecionada</label>
                    )}
                    <button onClick={createFolderWithGroups} className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white" disabled={!fName || loading}>Criar na estrutura</button>
                  </div>

                  <div className="border rounded p-3 space-y-3">
                    <div className="font-semibold text-sm">Grupos e permissões da pasta selecionada</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <select value={fpGroupId} onChange={(e) => setFpGroupId(e.target.value)} className="px-3 py-2 border rounded">
                        <option value="">Selecione grupo</option>
                        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                      <select value={fpPermission} onChange={(e) => setFpPermission(e.target.value)} className="px-3 py-2 border rounded">
                        <option value="L">L</option>
                        <option value="LG">LG</option>
                        <option value="LE">LE</option>
                        <option value="FULL">FULL</option>
                      </select>
                    </div>
                    <button onClick={() => postAndReload('/adfs/folder-permissions', { folderNodeId: selectedFolderId, groupId: fpGroupId, permission: fpPermission })} className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white" disabled={!selectedFolderId || !fpGroupId || loading}>Adicionar permissão</button>
                    <div className="text-sm border rounded p-2 max-h-36 overflow-auto space-y-2">
                      {selectedFolder ? (
                        selectedFolder.permissions.length ? selectedFolder.permissions.map((p) => (
                          <div key={p.id} className="flex items-center justify-between gap-2">
                            <span>[{p.group.name}:{p.permission}]</span>
                            <button onClick={() => removePermission(p.id)} className="text-xs px-2 py-1 rounded border hover:bg-gray-50">Remover</button>
                          </div>
                        )) : <div className="text-gray-500">Sem permissões cadastradas.</div>
                      ) : <div className="text-gray-500">Selecione uma pasta na árvore.</div>}
                    </div>

                    <div className="text-sm border rounded p-2 max-h-40 overflow-auto space-y-2">
                      <div className="font-semibold mb-1">Grupos relacionados</div>
                      {selectedFolder ? (
                        selectedFolderGroups.length ? selectedFolderGroups.map((group) => (
                          <div key={group.id} className="flex items-center justify-between gap-2">
                            <button onClick={() => selectGroup(group.id)} className="text-left flex-1 hover:text-blue-700">
                              [{group.kind}] {group.name}{group.permission ? ` (${group.permission})` : ""}
                            </button>
                            <button onClick={() => removeGroup(group.id)} className="text-xs px-2 py-1 rounded border hover:bg-gray-50">Excluir</button>
                          </div>
                        )) : <div className="text-gray-500">Nenhum grupo relacionado identificado.</div>
                      ) : <div className="text-gray-500">Selecione uma pasta na árvore.</div>}
                    </div>

                    {editingGroupId && (
                      <div className="border rounded p-2 space-y-2">
                        <div className="font-semibold text-sm">Editar grupo</div>
                        <input value={editingGroupName} onChange={(e) => setEditingGroupName(e.target.value)} className="w-full px-3 py-2 border rounded" />
                        <select value={editingGroupPermission} onChange={(e) => setEditingGroupPermission(e.target.value)} className="w-full px-3 py-2 border rounded">
                          <option value="L">L</option>
                          <option value="LG">LG</option>
                          <option value="LE">LE</option>
                          <option value="FULL">FULL</option>
                        </select>
                        <div className="flex gap-2">
                          <button onClick={saveGroup} className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white" disabled={!editingGroupName || loading}>Salvar grupo</button>
                          <button onClick={() => removeGroup(editingGroupId, true)} className="px-3 py-2 rounded border hover:bg-gray-50" disabled={loading}>Excluir com dependências</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="p-4 bg-card border border-border rounded shadow space-y-3">
              <h2 className="font-semibold">Todos os Grupos</h2>
              <input
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                className="w-full px-3 py-2 border rounded"
                placeholder="Buscar por nome ou tipo"
              />
              <div className="text-sm max-h-48 overflow-auto border rounded p-2 space-y-2">
                {filteredGroups.map((group) => (
                  <div key={group.id} className="flex items-center justify-between gap-2 border rounded px-2 py-1">
                    <button onClick={() => selectGroup(group.id)} className="text-left flex-1 hover:text-blue-700">
                      [{group.kind}] {group.name}{group.permission ? ` (${group.permission})` : ""}
                    </button>
                    <button onClick={() => removeGroup(group.id)} className="text-xs px-2 py-1 rounded border hover:bg-gray-50">Excluir</button>
                  </div>
                ))}
                {!filteredGroups.length && <div className="text-gray-500">Nenhum grupo encontrado.</div>}
              </div>
              <div className="border rounded p-3 space-y-2 text-sm">
                <div className="font-semibold">Vínculos do grupo selecionado</div>
                {!groupDependencies ? (
                  <div className="text-gray-500">Selecione um grupo para ver vínculos e fazer override.</div>
                ) : (
                  <>
                    <div><strong>Grupo:</strong> [{groupDependencies.kind}] {groupDependencies.name}{groupDependencies.permission ? ` (${groupDependencies.permission})` : ""}</div>
                    {groupDependencies.orgNode && <div><strong>Estrutura:</strong> [{groupDependencies.orgNode.type}] {groupDependencies.orgNode.name}</div>}
                    <div><strong>Usuários vinculados:</strong> {groupDependencies.counts.users}</div>
                    <div><strong>Permissões vinculadas:</strong> {groupDependencies.counts.folderPermissions}</div>
                    <div className="max-h-28 overflow-auto border rounded p-2 space-y-1">
                      {groupDependencies.users.map((user) => (
                        <div key={user.id}>Usuário: {user.fullName} ({user.username})</div>
                      ))}
                      {groupDependencies.folderPermissions.map((item) => (
                        <div key={item.id}>Pasta: {item.folder.name} [{item.permission}]</div>
                      ))}
                      {!groupDependencies.users.length && !groupDependencies.folderPermissions.length && <div className="text-gray-500">Sem vínculos ativos.</div>}
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <input value={editingGroupName} onChange={(e) => setEditingGroupName(e.target.value)} className="w-full px-3 py-2 border rounded" placeholder="Nome do grupo" />
                      <select value={editingGroupPermission} onChange={(e) => setEditingGroupPermission(e.target.value)} className="w-full px-3 py-2 border rounded">
                        <option value="L">L</option>
                        <option value="LG">LG</option>
                        <option value="LE">LE</option>
                        <option value="FULL">FULL</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveGroup} className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white" disabled={!editingGroupId || !editingGroupName || loading}>Salvar override</button>
                      <button onClick={() => editingGroupId && removeGroup(editingGroupId, true)} className="px-3 py-2 rounded border hover:bg-gray-50" disabled={!editingGroupId || loading}>Excluir com dependências</button>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>

          <section className="mt-6 p-4 bg-card border border-border rounded shadow">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Script PowerShell (preview)</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => loadProject(projectId)} className="px-3 py-2 rounded border">Atualizar</button>
                <button onClick={downloadPs1} className="px-3 py-2 rounded border" disabled={!script}>Download</button>
              </div>
            </div>
            <textarea value={script} readOnly className="mt-3 w-full h-80 px-3 py-2 border rounded font-mono text-xs" />
          </section>
        </>
      )}
    </main>
  );
}
