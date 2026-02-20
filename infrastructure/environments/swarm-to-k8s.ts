import * as path from 'path';
import kleur from 'kleur'
import { error, info, log, success, warn } from './logger'
import { updateWorkflowEnvironments } from './update-workflows';
import { readYamlFile } from './utils';
import {
    generateInventory,
    copyChartsValues,
    extractAndModifyUsers,
    extractWorkerNodes,
    extractBackupNode,
    dockerManagerFirst
} from './templates'



(async () => {
    log(kleur.bold(
        "------------------------------------------------\n" +
        "OpenCRVS Infrastructure migration script: \n" +
        "Migrating Swarm configurations to Kubernetes\n" +
        "------------------------------------------------\n"
    ));
    const environment_type = process.env.ENVIRONMENT_TYPE || 'production';
    const environment = process.env.ENVIRONMENT || '';
    if (!environment) {
        error('\n', 'Environment variable ENVIRONMENT is not set. Exiting.');
        process.exit(1);
    }
    if (["backup", "jumpbox"].includes(environment)) {
        info(`  > ${environment} environment will not be migrated, see migration notes`)
        process.exit(0);
    }
    log(kleur.bold().underline('Migration properties:'));
    log(`  ✓ Environment: ${environment}`)

    const old_inventory_path = process.env.OLD_INVENTORY_PATH || '';
    if (!old_inventory_path) {
        error('\n', 'Environment variable OLD_INVENTORY_PATH is not set. Exiting.');
        log('\n', 'Old inventory path is required to read existing Swarm configurations.');
        process.exit(1);
    }
    const ansible_inventory = path.join(old_inventory_path, environment + '.yml');
    const data = readYamlFile(ansible_inventory) as any;
    log(`  ✓ Loaded old inventory file: ${ansible_inventory}`);

    const master = dockerManagerFirst(data) || ''
    log(`  ✓ Kubernetes API Host (Docker Manager): ${master}`);
    const users = extractAndModifyUsers(data);
    const worker_nodes = extractWorkerNodes(data);
    log(`  ✓ Worker nodes: ${worker_nodes.join(', ')}`);
    const backup_host = extractBackupNode(data);
    log(`  ✓ Backup host: ${backup_host}`);

    generateInventory(
        environment,
        {
            worker_nodes: worker_nodes,
            users: users,
            backup_host: backup_host,
            kube_api_host: master
        }
    )

    copyChartsValues(
        environment,
        {
            env: environment,
            environment_type: environment_type,
            // FIXME: In general that should be environment_type,
            // Hardcode like this blocks us from being generic:
            // https://github.com/opencrvs/opencrvs-core/issues/11171
            is_qa_env: environment !== 'production' ? "true" : "false",
            backup_enabled: environment === 'production' ? "true" : "false",
            restore_enabled: environment === 'staging' ? "true" : "false",
            restore_environment_name: environment === 'staging' ? "production" : "",
            traefik_mode: "static_ssl",
            backup_type: "dump",
        }
    )
    await updateWorkflowEnvironments();
})();
