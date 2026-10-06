/** Records an important action. Pass the transaction client so the log commits or rolls back with the change. */
export const audit = (db, actorId, action, targetType, targetId, metadata = {}) =>
  db.query('INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata) VALUES ($1,$2,$3,$4,$5)',
    [actorId, action, targetType, String(targetId), JSON.stringify(metadata)]);
