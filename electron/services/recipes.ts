import type { AppDatabase } from '../db/connection';
import { nowIso } from './util';
import { audit } from './audit';
import { getRawMaterial } from './masters';
import type { Recipe, RecipeItem, Unit, Status } from '../../src/shared/types';

export interface RecipeItemInput {
  rawMaterialId: number;
  quantity: number;
  unit: Unit;
}

export interface RecipeInput {
  productId: number;
  name?: string;
  outputQuantity: number;
  outputUnit: Unit;
  items: RecipeItemInput[];
  status?: Status;
}

export function getRecipe(db: AppDatabase, id: number): Recipe | undefined {
  const row = db.get<Recipe>(
    `SELECT r.*, p.name AS productName FROM recipes r JOIN products p ON p.id=r.product_id WHERE r.id=?`,
    [id],
  );
  if (!row) return undefined;
  row.items = db.query<RecipeItem>(
    `SELECT ri.*, rm.name AS rawMaterialName FROM recipe_items ri
     JOIN raw_materials rm ON rm.id=ri.raw_material_id WHERE ri.recipe_id=? ORDER BY ri.id`,
    [id],
  );
  return row;
}

export function listRecipes(db: AppDatabase): Recipe[] {
  return db.query<Recipe>(
    `SELECT r.*, p.name AS productName FROM recipes r JOIN products p ON p.id=r.product_id ORDER BY p.name`,
  );
}

/** Active recipe for a product, if any. */
export function getActiveRecipeForProduct(db: AppDatabase, productId: number): Recipe | undefined {
  const row = db.get<Recipe>(
    `SELECT r.*, p.name AS productName FROM recipes r JOIN products p ON p.id=r.product_id
     WHERE r.product_id=? AND r.status='active' ORDER BY r.id DESC LIMIT 1`,
    [productId],
  );
  if (!row) return undefined;
  row.items = db.query<RecipeItem>(
    `SELECT ri.*, rm.name AS rawMaterialName FROM recipe_items ri
     JOIN raw_materials rm ON rm.id=ri.raw_material_id WHERE ri.recipe_id=? ORDER BY ri.id`,
    [row.id],
  );
  return row;
}

export function createRecipe(db: AppDatabase, input: RecipeInput): Recipe {
  if (!input.productId) throw new Error('Select a product');
  if (!input.items || input.items.length === 0) throw new Error('Recipe requires at least one material');
  if (!(input.outputQuantity > 0)) throw new Error('Recipe output quantity must be > 0');

  return db.transaction(() => {
    const existing = db.get<{ id: number }>('SELECT id FROM recipes WHERE product_id=? AND status=\'active\'', [
      input.productId,
    ]);
    if (existing) {
      throw new Error('There is already an active recipe for this product. Deactivate it or edit it instead.');
    }
    db.run(
      `INSERT INTO recipes (product_id, name, output_quantity, output_unit, status) VALUES (?, ?, ?, ?, ?)`,
      [input.productId, input.name?.trim() || 'Recipe', input.outputQuantity, input.outputUnit, input.status ?? 'active'],
    );
    const id = db.getLastInsertId();
    insertItems(db, id, input.items);
    audit(db, 'RECIPE_CREATE', 'recipes', id, `Created recipe for product #${input.productId}`);
    return getRecipe(db, id)!;
  });
}

function insertItems(db: AppDatabase, recipeId: number, items: RecipeItemInput[]): void {
  for (const it of items) {
    const material = getRawMaterial(db, it.rawMaterialId);
    if (!material) throw new Error('Recipe references an unknown raw material');
    if (!(it.quantity > 0)) throw new Error(`Invalid recipe quantity for ${material.name}`);
    db.run(
      `INSERT INTO recipe_items (recipe_id, raw_material_id, quantity, unit) VALUES (?, ?, ?, ?)`,
      [recipeId, it.rawMaterialId, Number(it.quantity), it.unit ?? material.unit],
    );
  }
}

export function updateRecipe(db: AppDatabase, id: number, input: RecipeInput): Recipe {
  const existing = getRecipe(db, id);
  if (!existing) throw new Error('Recipe not found');
  if (!input.items || input.items.length === 0) throw new Error('Recipe requires at least one material');
  if (!(input.outputQuantity > 0)) throw new Error('Recipe output quantity must be > 0');

  const productId = input.productId ?? existing.productId;
  return db.transaction(() => {
    const conflict = db.get<{ id: number }>(
      `SELECT id FROM recipes WHERE product_id=? AND status='active' AND id<>?`,
      [productId, id],
    );
    if (conflict) throw new Error('Another active recipe already exists for this product');
    db.run('DELETE FROM recipe_items WHERE recipe_id=?', [id]);
    db.run(
      `UPDATE recipes SET product_id=?, name=?, output_quantity=?, output_unit=?, status=?, updated_at=? WHERE id=?`,
      [
        productId,
        input.name?.trim() || existing.name,
        input.outputQuantity,
        input.outputUnit,
        input.status ?? existing.status,
        nowIso(),
        id,
      ],
    );
    insertItems(db, id, input.items);
    audit(db, 'RECIPE_UPDATE', 'recipes', id, `Updated recipe #${id}`);
    return getRecipe(db, id)!;
  });
}

export function setRecipeStatus(db: AppDatabase, id: number, status: Status): Recipe {
  const existing = getRecipe(db, id);
  if (!existing) throw new Error('Recipe not found');
  db.run('UPDATE recipes SET status=?, updated_at=? WHERE id=?', [status, nowIso(), id]);
  audit(db, 'RECIPE_STATUS', 'recipes', id, `Recipe status -> ${status}`);
  return getRecipe(db, id)!;
}

export function deleteRecipe(db: AppDatabase, id: number): void {
  db.transaction(() => {
    db.run('DELETE FROM recipe_items WHERE recipe_id=?', [id]);
    db.run('DELETE FROM recipes WHERE id=?', [id]);
  });
  audit(db, 'RECIPE_DELETE', 'recipes', id, `Deleted recipe #${id}`);
}