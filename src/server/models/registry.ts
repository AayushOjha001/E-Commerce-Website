import mongoose, { type Model, type Schema } from "mongoose";

/**
 * Registers a model once per process, reusing it if already present.
 *
 * Next.js clears the module registry on hot reload, so a bare
 * `mongoose.model(name, schema)` runs again on every edit. In Mongoose 8 that
 * threw `OverwriteModelError`; Mongoose 9 (this project — see PLAN D12) no
 * longer throws, but re-registering still produces a *different* model object
 * while the old one stays in `mongoose.models`. Queries then split across two
 * models and cached indexes/hooks drift. Going through the registry keeps one
 * model identity for a given name.
 *
 * `TModel` is threaded through rather than defaulted away so that schemas
 * declaring instance methods (e.g. `User.matchPassword`) keep them on the
 * returned model instead of collapsing to a plain `Model<TRawDoc>`.
 */
export function defineModel<TRawDoc, TModel = Model<TRawDoc>>(
  name: string,
  schema: Schema<TRawDoc, TModel>,
): TModel {
  const existing = mongoose.models[name] as TModel | undefined;
  return existing ?? mongoose.model<TRawDoc, TModel>(name, schema);
}
