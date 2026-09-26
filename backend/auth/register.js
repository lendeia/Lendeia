// ==================================================================
// FILE TYPE : MOCK BACKEND — AUTH
// PURPOSE   :
//   Fake registration endpoint. Validates name/email shape only (see
//   shared/validation) then fabricates a User object. Not currently called
//   from any UI (Login.jsx only wires up 'login', not a separate register flow).
// CONNECTS TO :
//   Depends on shared/validation/index.js for isValidEmail/isNonEmptyString.
// ==================================================================
import { isValidEmail, isNonEmptyString } from "../../shared/validation";

/**
 * MOCK backend function — registers a new account.
 * @param {{ name: string, email: string, password?: string }} input
 * @returns {Promise<import('../../shared/types').User>}
 */
export async function register(input) {
  if (!isNonEmptyString(input.name)) throw new Error("Name is required.");
  if (!isValidEmail(input.email)) throw new Error("A valid email is required.");

  await new Promise((r) => setTimeout(r, 150));
  return { id: input.email, name: input.name, email: input.email };
}
