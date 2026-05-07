import bcrypt from 'bcryptjs';
import { ADMIN_PASSWORD_HASH, ADMIN_USERNAME } from '../config.js';

export async function verifyAdminCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  if (!ADMIN_PASSWORD_HASH) return false;
  const usernameMatch = username === ADMIN_USERNAME;
  const passwordMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  return usernameMatch && passwordMatch;
}
