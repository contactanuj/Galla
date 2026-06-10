import { getDatabase } from '../schema';
import { getTenantId } from '../../lib/tenantContext';
import { addToSyncQueue } from '../../services/sync/syncQueue';
import { deleteImage } from '../../lib/imageUpload';

export interface LayoutNode {
  id: string; name: string; type: 'section'|'aisle'|'rack'|'shelf';
  parent_id?: string; position_index: number; metadata?: string;
  image_uri?: string | null; image_url?: string | null;
  tenant_id?: string; created_at: number;
}

export async function getLayoutNodeById(id: string): Promise<LayoutNode | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<LayoutNode>('SELECT * FROM layout_nodes WHERE id=?', [id]);
  return row ?? null;
}

export async function setLayoutNodeImage(id: string, imageUri: string | null, imageUrl: string | null): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync('UPDATE layout_nodes SET image_uri=?, image_url=? WHERE id=?', [imageUri, imageUrl, id]);
  await addToSyncQueue('layout_nodes', id, 'update', { id, image_url: imageUrl, tenant_id: getTenantId() ?? 't1', updated_at: now });
}

export async function getAllLayoutNodes(): Promise<LayoutNode[]> {
  const db = await getDatabase();
  const tid = getTenantId();
  return tid
    ? db.getAllAsync<LayoutNode>('SELECT * FROM layout_nodes WHERE tenant_id=? ORDER BY position_index', [tid])
    : db.getAllAsync<LayoutNode>('SELECT * FROM layout_nodes ORDER BY position_index');
}

export async function getLayoutNodesByParent(parentId: string | null): Promise<LayoutNode[]> {
  const db = await getDatabase();
  const tid = getTenantId();
  if (parentId === null) {
    return tid
      ? db.getAllAsync<LayoutNode>('SELECT * FROM layout_nodes WHERE parent_id IS NULL AND tenant_id=? ORDER BY position_index', [tid])
      : db.getAllAsync<LayoutNode>('SELECT * FROM layout_nodes WHERE parent_id IS NULL ORDER BY position_index');
  }
  return tid
    ? db.getAllAsync<LayoutNode>('SELECT * FROM layout_nodes WHERE parent_id=? AND tenant_id=? ORDER BY position_index', [parentId, tid])
    : db.getAllAsync<LayoutNode>('SELECT * FROM layout_nodes WHERE parent_id=? ORDER BY position_index', [parentId]);
}

export async function createLayoutNode(node: Omit<LayoutNode, 'created_at'>): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const tid = node.tenant_id ?? getTenantId() ?? 't1';
  await db.runAsync('INSERT INTO layout_nodes (id,name,type,parent_id,position_index,metadata,tenant_id,created_at) VALUES (?,?,?,?,?,?,?,?)', [node.id,node.name,node.type,node.parent_id??null,node.position_index,node.metadata??null,tid,now]);
  await addToSyncQueue('layout_nodes', node.id, 'create', { id: node.id, name: node.name, type: node.type, parent_id: node.parent_id ?? null, position_index: node.position_index, metadata: node.metadata ?? null, tenant_id: tid, created_at: now, updated_at: now });
}

export async function updateLayoutNode(id: string, name: string, positionIndex: number): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync('UPDATE layout_nodes SET name=?,position_index=? WHERE id=?', [name,positionIndex,id]);
  await addToSyncQueue('layout_nodes', id, 'update', { id, name, position_index: positionIndex, tenant_id: getTenantId() ?? 't1', updated_at: now });
}

export async function deleteLayoutNode(id: string): Promise<void> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ image_url: string | null }>('SELECT image_url FROM layout_nodes WHERE id=?', [id]);
  await db.runAsync('DELETE FROM layout_nodes WHERE id=?', [id]);
  await addToSyncQueue('layout_nodes', id, 'delete', { id });
  await deleteImage(existing?.image_url);
}

export async function getProductLocationPath(productId: string): Promise<string[]> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ node_id: string }>('SELECT layout_node_id as node_id FROM product_locations WHERE product_id=? LIMIT 1', [productId]);
  if (!row) return [];
  const path: string[] = [];
  let currentId: string | null = row.node_id;
  while (currentId) {
    const node: { id: string; name: string; parent_id: string | null } | null =
      await db.getFirstAsync('SELECT id,name,parent_id FROM layout_nodes WHERE id=?', [currentId]);
    if (!node) break;
    path.unshift(node.name);
    currentId = node.parent_id ?? null;
  }
  return path;
}

/** The single layout node a product is currently placed at (or null). */
export async function getProductLocationNodeId(productId: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ layout_node_id: string }>(
    'SELECT layout_node_id FROM product_locations WHERE product_id = ? LIMIT 1', [productId]
  );
  return row?.layout_node_id ?? null;
}

export async function assignProductLocation(productId: string, layoutNodeId: string): Promise<void> {
  const db = await getDatabase();
  const tid = getTenantId() ?? 't1';
  const id = `${productId}-${layoutNodeId}`;
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync('INSERT OR REPLACE INTO product_locations (id,product_id,layout_node_id,tenant_id,created_at) VALUES (?,?,?,?,?)', [id,productId,layoutNodeId,tid,now]);
  await addToSyncQueue('product_locations', id, 'create', { id, product_id: productId, layout_node_id: layoutNodeId, tenant_id: tid, created_at: now });
}

export async function removeProductLocation(productId: string, layoutNodeId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM product_locations WHERE product_id=? AND layout_node_id=?', [productId,layoutNodeId]);
  await addToSyncQueue('product_locations', `${productId}-${layoutNodeId}`, 'delete', { id: `${productId}-${layoutNodeId}` });
}

/** Re-parent a node within the hierarchy (null = move to top level). */
export async function moveLayoutNode(id: string, newParentId: string | null): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync('UPDATE layout_nodes SET parent_id=? WHERE id=?', [newParentId, id]);
  await addToSyncQueue('layout_nodes', id, 'update', { id, parent_id: newParentId, tenant_id: getTenantId() ?? 't1', updated_at: now });
}

/** Update only the sibling sort position of a node. */
export async function setLayoutNodePosition(id: string, positionIndex: number): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync('UPDATE layout_nodes SET position_index=? WHERE id=?', [positionIndex, id]);
  await addToSyncQueue('layout_nodes', id, 'update', { id, position_index: positionIndex, tenant_id: getTenantId() ?? 't1', updated_at: now });
}

/** Products currently assigned to a layout node. */
export async function getProductsAtNode(layoutNodeId: string): Promise<{ id: string; name: string }[]> {
  const db = await getDatabase();
  return db.getAllAsync<{ id: string; name: string }>(
    'SELECT p.id, p.name FROM product_locations pl JOIN products p ON p.id = pl.product_id WHERE pl.layout_node_id = ? ORDER BY p.name',
    [layoutNodeId]
  );
}

/** Relocate a product to a single node (clears any previous locations). */
export async function moveProductLocation(productId: string, layoutNodeId: string): Promise<void> {
  const db = await getDatabase();
  const tid = getTenantId() ?? 't1';
  const now = Math.floor(Date.now() / 1000);
  const existing = await db.getAllAsync<{ id: string }>('SELECT id FROM product_locations WHERE product_id=?', [productId]);
  await db.runAsync('DELETE FROM product_locations WHERE product_id=?', [productId]);
  for (const e of existing) await addToSyncQueue('product_locations', e.id, 'delete', { id: e.id });
  const id = `${productId}-${layoutNodeId}`;
  await db.runAsync('INSERT OR REPLACE INTO product_locations (id,product_id,layout_node_id,tenant_id,created_at) VALUES (?,?,?,?,?)', [id, productId, layoutNodeId, tid, now]);
  await addToSyncQueue('product_locations', id, 'create', { id, product_id: productId, layout_node_id: layoutNodeId, tenant_id: tid, created_at: now });
}
