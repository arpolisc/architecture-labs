import * as fs from 'node:fs';
import * as path from 'node:path';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';

export type SqlValue = string | number | null;

let sqlJs: Promise<SqlJsStatic> | null = null;
const loadSqlJs = () => (sqlJs ??= initSqlJs());

/**
 * Тонка обгортка над SQLite (sql.js, WebAssembly: працює без нативної збірки).
 * Кожен сервіс відкриває власний файл бази даних; спільної бази між сервісами немає.
 * Після кожної зафіксованої транзакції файл атомарно записується на диск.
 */
export class SqlDatabase {
  private depth = 0;

  private constructor(
    private readonly db: Database,
    readonly file?: string,
  ) {}

  static async open(file?: string): Promise<SqlDatabase> {
    const SQL = await loadSqlJs();
    if (file && fs.existsSync(file)) {
      return new SqlDatabase(new SQL.Database(fs.readFileSync(file)), file);
    }
    if (file) fs.mkdirSync(path.dirname(file), { recursive: true });
    return new SqlDatabase(new SQL.Database(), file);
  }

  /** Виконує один або кілька операторів без параметрів (наприклад, скрипт міграції). */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  run(sql: string, params: SqlValue[] = []): void {
    this.db.run(sql, params);
  }

  all<T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): T[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  get<T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  get inTransaction(): boolean {
    return this.depth > 0;
  }

  /** Виконує fn в одній транзакції; якщо транзакція вже відкрита, приєднується до неї. */
  transaction<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.begin();
    try {
      const result = fn();
      this.commit();
      return result;
    } catch (error) {
      this.rollback();
      throw error;
    }
  }

  begin(): void {
    if (this.depth > 0) throw new Error('Транзакція вже відкрита');
    this.db.exec('BEGIN');
    this.depth = 1;
  }

  commit(): void {
    this.db.exec('COMMIT');
    this.depth = 0;
    this.persist();
  }

  rollback(): void {
    if (this.depth === 0) return;
    this.db.exec('ROLLBACK');
    this.depth = 0;
  }

  /** Атомарний запис файлу бази даних (тимчасовий файл + перейменування). */
  persist(): void {
    if (!this.file) return;
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(this.db.export()));
    fs.renameSync(tmp, this.file);
  }

  close(): void {
    this.db.close();
  }
}
