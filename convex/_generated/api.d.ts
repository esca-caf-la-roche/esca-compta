/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytiques from "../analytiques.js";
import type * as auth from "../auth.js";
import type * as drive from "../drive.js";
import type * as email from "../email.js";
import type * as http from "../http.js";
import type * as migrations from "../migrations.js";
import type * as previsionnels from "../previsionnels.js";
import type * as references from "../references.js";
import type * as saisons from "../saisons.js";
import type * as tiers from "../tiers.js";
import type * as transactions from "../transactions.js";
import type * as typesDocuments from "../typesDocuments.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytiques: typeof analytiques;
  auth: typeof auth;
  drive: typeof drive;
  email: typeof email;
  http: typeof http;
  migrations: typeof migrations;
  previsionnels: typeof previsionnels;
  references: typeof references;
  saisons: typeof saisons;
  tiers: typeof tiers;
  transactions: typeof transactions;
  typesDocuments: typeof typesDocuments;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
