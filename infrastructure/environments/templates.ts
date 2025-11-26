import fs from "fs";
import path from "path";
import { log } from './logger'
/**
 * Replace placeholders in file content.
 * Customize the replacements map to your needs.
 */
function replacePlaceholders(content: string, replacements: Record<string, string>): string {
  let updated = content;
  for (const [key, value] of Object.entries(replacements)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g"); // matches ${KEY}
    let clear_value = String(value).replace(/[\x00-\x1F\x7F]/g, ""); // remove control characters
    updated = updated.replace(regex, clear_value);
  }
  return updated;
}

/**
 * Copy charts-values directory into environments/<env>
 * @param env Environment name
 * Usage: copyChartsValues('dev')
 */
/**
 * Recursively copy a directory and replace placeholders in text files.
 */
export function copyChartsValues(env: string, replacements: Record<string, string>) {
  const srcDir = path.resolve(__dirname, "templates", "charts-values");
  const destDir = path.resolve(__dirname, "..", "..", "environments", env);
  fs.mkdirSync(destDir, { recursive: true });

  function copyRecursive(src: string, dest: string) {
    const stat = fs.statSync(src);

    if (stat.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      for (const item of fs.readdirSync(src)) {
        copyRecursive(path.join(src, item), path.join(dest, item));
      }
    } else {
      if (fs.existsSync(dest)) {
        log(`⚠️ Skipping existing file: ${dest}`);
        return;
      }
      // read file
      const content = fs.readFileSync(src, "utf8");

      // replace placeholders
      const updated = replacePlaceholders(content, replacements);

      // write updated file
      fs.writeFileSync(dest, updated, "utf8");
      log(`✅ Created: ${dest}`);
    }
  }

  copyRecursive(srcDir, destDir);
}

/**
 * Generate Ansible inventory file from template
 * @param env Environment name
 * @param number_of_servers Number of servers (1 for single-node, >1 for multi-node)
 * @param values Key-value pairs to replace in the template
 * Usage: generateInventory('dev', 1, {
 * HOST: process.env.APP_HOST || "localhost",
 * USER: process.env.SSH_USER || "ubuntu",
 * PORT: process.env.SSH_PORT || "22"
 * });
 */
export function generateInventory(env: string, values: Record<string, any>){
  // Template and output paths
  const templatePath = path.join(__dirname, "templates", "inventory", "inventory.template.yml");
  const outputPath = path.join(__dirname, "..", "server-setup", "inventory", `${env}.yml`);

  // Check if output file already exists
  if (fs.existsSync(outputPath)) {
    log(`⚠️ Skipping ${templatePath}, file already exists at ${outputPath}`);
    return;
  }
  let template = fs.readFileSync(templatePath, "utf-8");

  // Extract worker nodes and backup host from values
  let worker_nodes = values['worker_nodes'].map((e: string) => String(e)
    .replace(/[\x00-\x1F\x7F]/g, ""))
    .filter((e: string) => e.length > 0);

  // Generate workers block
  if (worker_nodes && worker_nodes.length > 0) {
    let workersBlock = `
    # Workers section is optional, for single node cluster feel free to remove this section
    # section can be added later
    # more workers can be added later as well
    workers:
      hosts:`;

    worker_nodes.forEach((host: string, index: number) => {
      const isFirstWorker = index === 0;
      workersBlock += `
        worker${index}:
          ansible_host: ${host}${isFirstWorker ? `
          labels:
            # By default all datastores are deployed to worker node with role data1
            role: data1` : ''}
`;
    });
  
  template = template.replace('{{WORKERS_BLOCK}}', workersBlock);
  } else {
    // No worker nodes, remove the placeholder
    template = template.replace('{{WORKERS_BLOCK}}', '');
  }


  // Generate backup block if backup_host is provided
  const backupHost = String(values['backup_host']).replace(/[\x00-\x1F\x7F]/g, "");
  let backupBlock = '';
  if (backupHost.length > 0) {
    backupBlock = `
    # backup section is optional, feel free to remove if backups are not enabled
    # section can be added later
    backup:
      hosts:
        backup1:
          ansible_host: ${backupHost}
`;
  }
  template = template.replace('{{BACKUP_BLOCK}}', backupBlock);

  // Determine if single-node or multi-node
  values['single_node'] = (worker_nodes.length > 0 || backupHost) ? "false" : "true";
  const updated = replacePlaceholders(template, values);
  values
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, updated);
  log(`✅ Generated inventory file at ${outputPath}`);
}
