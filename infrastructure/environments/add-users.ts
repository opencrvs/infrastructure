import { input, select, confirm, editor } from '@inquirer/prompts';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

interface User {
  name: string;
  ssh_keys: string[];
  state: 'present' | 'absent';
  role: 'admin' | 'operator';
}

/**
 * Gets the current system username
 * 
 * @returns {string} Current OS username
 */
function getCurrentUsername(): string {
  return os.userInfo().username;
}

/**
 * Reads SSH public keys from the current user's .ssh directory
 * 
 * @returns {string[]} Array of SSH public keys found
 */
function getCurrentUserSSHKeys(): string[] {
  const homeDir = os.homedir();
  const sshDir = path.join(homeDir, '.ssh');
  const keys: string[] = [];
  
  // Common public key filenames
  const keyFiles = [
    'id_rsa.pub',
    'id_ecdsa.pub',
    'id_ed25519.pub',
    'id_dsa.pub'
  ];
  
  for (const keyFile of keyFiles) {
    const keyPath = path.join(sshDir, keyFile);
    
    try {
      if (fs.existsSync(keyPath)) {
        const keyContent = fs.readFileSync(keyPath, 'utf8').trim();
        if (keyContent) {
          keys.push(keyContent);
        }
      }
    } catch (error) {
      // Silently skip if can't read the file
      continue;
    }
  }
  
  return keys;
}

async function get_role(): Promise<'admin' | 'operator'> {
    return await select({
      message: 'Select user role:',
      choices: [
        { name: 'Admin (sudo)', value: 'admin' },
        { name: 'Operator', value: 'operator' }
      ]
    });
}
/**
 * Asks if user wants to add current system user as the first user
 * 
 * @returns {Promise<User | null>} User object if accepted, null if declined
 */
async function askToAddCurrentUser(): Promise<User | null> {
  const currentUsername = getCurrentUsername();
  const currentKeys = getCurrentUserSSHKeys();
  
  if (currentKeys.length === 0) {
    // No SSH keys found for current user
    return null;
  }
  
  const addCurrentUser = await confirm({
    message: `Add current user "${currentUsername}" with ${currentKeys.length} SSH key(s)?`,
    default: true
  });
  
  if (!addCurrentUser) {
    return null;
  }
  
  // Ask for role
  const role = await get_role();
  
  return {
    name: currentUsername,
    ssh_keys: currentKeys,
    state: 'present',
    role: role
  };
}

/**
 * Collects user configuration through interactive prompts
 * 
 * @returns {Promise<User[]>} JSON data ready for Handlebars template
 */
export async function collectUsersConfiguration(): Promise<User[]> {
  const users: User[] = [];
  
  const shouldConfigure = await confirm({
    message: 'Would you like to configure users with remote access?',
    default: true
  });
  
  if (!shouldConfigure) {
    return [];
  }
  
  // Try to add current user first
  const currentUser = await askToAddCurrentUser();
  if (currentUser) {
    users.push(currentUser);
    console.log(`✅ Current user "${currentUser.name}" added with ${currentUser.ssh_keys.length} SSH key(s)\n`);
  }
  
  // Ask if they want to add more users
  const addMoreUsers = await confirm({
    message: 'Would you like to add additional users?',
    default: currentUser ? false : true
  });
  
  if (!addMoreUsers) {
    return users;
  }
  
  // Main loop for additional users
  do {
    // Collect user name
    const name = await input({
      message: 'Enter username:',
      validate: (value) => {
        if (!value.trim()) {
          return 'Username required';
        }
        if (users.find(u => u.name === value.trim())) {
          return `User "${value}" already exists`;
        }
        return true;
      }
    });
    
    // Collect SSH keys
    const keysInput = await editor({
      message: 'Paste SSH public key(s) (one per line, press Enter when done):'
    });
    
    const ssh_keys = keysInput
      .split('\n')
      .map(key => key.trim())
      .filter(key => key && !key.startsWith('#'));
    
    if (ssh_keys.length === 0) {
      console.log('⚠️  Warning: No SSH keys provided. User will not be able to connect.');
      
      const continueWithoutKeys = await confirm({
        message: 'Continue without SSH keys?',
        default: false
      });
      
      if (!continueWithoutKeys) {
        continue;
      }
    }
    
    // Select role
    const role = await get_role()
    
    users.push({
      name,
      ssh_keys,
      state: 'present',
      role: role
    });
    
    console.log(`✅ User "${name}" added (${ssh_keys.length} SSH key(s))\n`);
    
  } while (await confirm({ message: 'Would you like to create another user?', default: false }));
  
  // Display summary
  console.log(
    '\n' + '-'.repeat(50) + '\n',
    `📋 User Configuration Summary, Total users: ${users.length}\n`
  );
      ``
  users.forEach((user, index) => {
    console.log(`  ${index + 1}. User: ${user.name} Role: ${user.role} SSH Keys: ${user.ssh_keys.length}`);
  });
  
  console.log('-'.repeat(50) + '\n');
  
  return users;
}
