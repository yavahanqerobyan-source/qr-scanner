import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const sslEnabled = String(process.env.DATABASE_SSL || 'true').toLowerCase() !== 'false';
const rejectUnauthorized = String(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false';
const encryptionKey = process.env.PII_ENCRYPTION_KEY ? Buffer.from(process.env.PII_ENCRYPTION_KEY, 'base64url') : null;
const evidenceSecret = String(process.env.EVIDENCE_HASH_SECRET || process.env.OTP_SECRET || '');

export const databaseEnabled = Boolean(databaseUrl);

export const pool = databaseEnabled ? new Pool({
  connectionString: databaseUrl,
  ssl: sslEnabled ? { rejectUnauthorized } : false,
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  application_name: 'yulia-rebrova-atelier',
}) : null;

if (pool) {
  pool.on('error', (error) => console.error('[database] idle connection error:', error.message));
}

function requireDatabase() {
  if (!pool) throw Object.assign(new Error('База данных не настроена.'), { status: 503 });
}

function requireEncryption() {
  if (!encryptionKey || encryptionKey.length !== 32) {
    throw Object.assign(new Error('Ключ шифрования персональных данных не настроен.'), { status: 503 });
  }
}

function encryptPayload(payload) {
  requireEncryption();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

function decryptPayload(value) {
  requireEncryption();
  const [version, ivValue, tagValue, encryptedValue] = String(value || '').split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) throw new Error('Не удалось расшифровать данные обращения.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

export function hashEvidence(value) {
  if (!evidenceSecret || evidenceSecret.length < 32) return '';
  return createHmac('sha256', evidenceSecret).update(String(value || '')).digest('base64url');
}

function contentRowsToItems(rows) {
  return rows.map((row) => ({ ...row.data, id: row.id, published: row.published }));
}

export async function checkDatabase() {
  requireDatabase();
  const result = await pool.query('select current_database() as database, now() as server_time');
  return result.rows[0];
}

export async function getPublicContent() {
  requireDatabase();
  const result = await pool.query(`
    select kind, id, published, data
    from content_items
    where published = true and deleted_at is null
    order by kind, sort_order, created_at
  `);
  return {
    portfolio: contentRowsToItems(result.rows.filter((row) => row.kind === 'portfolio')),
    products: contentRowsToItems(result.rows.filter((row) => row.kind === 'product')),
  };
}

export async function getAdminSnapshot() {
  requireDatabase();
  const [contentResult, leadsResult, eventsResult] = await Promise.all([
    pool.query(`select kind, id, published, data from content_items where deleted_at is null order by kind, sort_order, created_at`),
    pool.query(`select id, type, status, channel, title, product_id, encrypted_payload, created_at from leads where deleted_at is null order by created_at desc limit 500`),
    pool.query(`select id, visitor_id, session_id, name, occurred_at, properties from analytics_events where occurred_at >= now() - interval '30 days' order by occurred_at desc limit 10000`),
  ]);
  return {
    portfolio: contentRowsToItems(contentResult.rows.filter((row) => row.kind === 'portfolio')),
    products: contentRowsToItems(contentResult.rows.filter((row) => row.kind === 'product')),
    databaseEmpty: contentResult.rows.length === 0,
    leads: leadsResult.rows.map((row) => {
      const payload = decryptPayload(row.encrypted_payload);
      return {
        id: row.id,
        type: row.type,
        status: row.status,
        channel: row.channel,
        title: row.title,
        productId: row.product_id || '',
        name: payload.name || '',
        detail: payload.detail || '',
        createdAt: row.created_at.toISOString(),
      };
    }),
    events: eventsResult.rows.map((row) => ({
      id: String(row.id),
      visitorId: row.visitor_id,
      sessionId: row.session_id,
      name: row.name,
      at: row.occurred_at.toISOString(),
      properties: row.properties,
    })),
  };
}

export async function replaceContent(kind, items, administrator) {
  requireDatabase();
  if (!['portfolio', 'product'].includes(kind)) throw new Error('Некорректный тип контента.');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('update content_items set deleted_at = now(), updated_at = now() where kind = $1 and deleted_at is null', [kind]);
    for (const [index, item] of items.entries()) {
      const data = { ...item };
      delete data.id;
      delete data.published;
      await client.query(`
        insert into content_items (kind, id, sort_order, published, data, deleted_at)
        values ($1, $2, $3, $4, $5::jsonb, null)
        on conflict (kind, id) do update set
          sort_order = excluded.sort_order,
          published = excluded.published,
          data = excluded.data,
          updated_at = now(),
          deleted_at = null
      `, [kind, item.id, index, Boolean(item.published), JSON.stringify(data)]);
    }
    await client.query(`insert into admin_audit_log (administrator, action, entity_type, metadata) values ($1, 'replace', $2, $3::jsonb)`, [administrator, kind, JSON.stringify({ count: items.length })]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function insertLead({ type, channel, title, productId, name, detail, consentVersion, consentAt, source, evidence }) {
  requireDatabase();
  const id = randomUUID();
  const encryptedPayload = encryptPayload({ name, detail });
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`
      insert into leads (id, type, channel, title, product_id, encrypted_payload, consent_version, consent_at, source, retention_until)
      values ($1, $2, $3, $4, nullif($5, ''), $6, $7, $8, $9, $8 + interval '180 days')
    `, [id, type, channel, title, productId || '', encryptedPayload, consentVersion, consentAt, source]);
    await client.query(`
      insert into consent_records (lead_id, consent_type, document_version, document_url, evidence, granted_at)
      values ($1, 'personal_data', $2, '/consent.html', $3::jsonb, $4)
    `, [id, consentVersion, JSON.stringify(evidence), consentAt]);
    await client.query('commit');
    return { id, createdAt: consentAt.toISOString() };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateLeadStatus(id, status, administrator) {
  requireDatabase();
  const result = await pool.query(`
    update leads set status = $2, updated_at = now() where id = $1 and deleted_at is null returning id
  `, [id, status]);
  if (!result.rowCount) throw Object.assign(new Error('Обращение не найдено.'), { status: 404 });
  await pool.query(`insert into admin_audit_log (administrator, action, entity_type, entity_id, metadata) values ($1, 'status_change', 'lead', $2, $3::jsonb)`, [administrator, id, JSON.stringify({ status })]);
}

export async function insertAnalyticsEvents(events, consentVersion) {
  requireDatabase();
  const client = await pool.connect();
  try {
    await client.query('begin');
    if (events[0]) {
      await client.query(`
        insert into consent_records (visitor_id, consent_type, document_version, document_url, evidence, granted_at)
        values ($1, 'analytics', $2, '/privacy.html#analytics', '{}'::jsonb, $3)
        on conflict do nothing
      `, [events[0].visitorId, consentVersion, events[0].occurredAt]);
    }
    for (const event of events) {
      await client.query(`
        insert into analytics_events (visitor_id, session_id, name, page, properties, occurred_at, retention_until)
        values ($1, $2, $3, $4, $5::jsonb, $6, $6 + interval '13 months')
      `, [event.visitorId, event.sessionId, event.name, event.page, JSON.stringify(event.properties), event.occurredAt]);
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function cleanupExpiredData() {
  requireDatabase();
  const [leads, events] = await Promise.all([
    pool.query(`update leads set encrypted_payload = 'expired', deleted_at = now(), updated_at = now() where retention_until < now() and deleted_at is null`),
    pool.query('delete from analytics_events where retention_until < now()'),
  ]);
  return { leadsAnonymized: leads.rowCount, eventsDeleted: events.rowCount };
}
