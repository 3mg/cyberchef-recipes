// Run inside nomad_admin, with its existing Docker socket and DB environment.
// No database credentials are written to disk or printed.
import Docker from 'dockerode';
import mysql from 'mysql2/promise';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const docker=new Docker({socketPath:'/var/run/docker.sock'});
const serviceName='nomad_cyberchef';
const directory='/app/storage/custom-cyberchef';
const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE||process.env.DB_NAME});
const [action,value]=process.argv.slice(2);
async function restore(backup, restoreDatabase = true) {
    let current;
    try { current=await docker.getContainer(serviceName).inspect(); } catch(error) {if(error.statusCode!==404)throw error;}
    if(current && current.Id!==backup.container.Id) {
        if(current.Config.Image!==backup.image)throw Error('Unexpected current image; refusing rollback');
        await docker.getContainer(current.Id).remove({force:true});
    }
    const original=docker.getContainer(backup.container.Id);
    const state=await original.inspect();
    if(state.Name!==`/${serviceName}`)await original.rename({name:serviceName});
    await original.update({RestartPolicy:backup.container.HostConfig.RestartPolicy});
    if(!state.State.Running)await original.start();
    if (restoreDatabase) {
        await db.execute('UPDATE services SET container_image=?, source_repo=?, available_update_version=?, updated_at=NOW() WHERE id=?',[
            backup.service.container_image,backup.service.source_repo,backup.service.available_update_version,backup.service.id
        ]);
    }
}
try {
    if(action==='rollback') {
        if(!/^[\dTZ._-]+$/.test(value||''))throw Error('Pass the saved backup ID');
        const backup=JSON.parse(await readFile(`${directory}/${value}.json`,'utf8'));
        await restore(backup);
        console.log('Original CyberChef container and NOMAD service configuration restored.');
    } else if(action==='deploy') {
        if(!/^homelab\/cyberchef:[a-zA-Z0-9._-]+$/.test(value||''))throw Error('Expected a local homelab/cyberchef image tag');
        await docker.getImage(value).inspect();
        const [rows]=await db.execute('SELECT id,container_image,source_repo,available_update_version FROM services WHERE service_name=?',[serviceName]);
        if(rows.length!==1)throw Error('Expected exactly one NOMAD CyberChef service');
        const original=docker.getContainer(serviceName),old=await original.inspect();
        if(old.Config.Image===value && rows[0].container_image===value)throw Error('This image is already deployed');
        if(old.Mounts.length)throw Error('Unexpected mounts; review before replacing this static-only container');
        const id=new Date().toISOString().replaceAll(':','-');
        const backup={service:rows[0],container:old,image:value};
        await mkdir(directory,{recursive:true,mode:0o700});
        await writeFile(`${directory}/${id}.json`,JSON.stringify(backup,null,2),{mode:0o600,flag:'wx'});
        let replacement;
        try {
            if(old.State.Running)await original.stop({t:10});
            await original.rename({name:`nomad_cyberchef_before_gauth_${id}`});
            await original.update({RestartPolicy:{Name:'no'}});
            const network=old.HostConfig.NetworkMode;
            replacement=await docker.createContainer({
                ...old.Config,Image:value,Hostname:'',name:serviceName,HostConfig:old.HostConfig,
                NetworkingConfig:{EndpointsConfig:{[network]:{Aliases:[serviceName]}}}
            });
            await replacement.start();
            let healthy=false;
            for(let i=0;i<12;i++) {
                try {
                    const state=await replacement.inspect();
                    const ip=state.NetworkSettings.Networks[network].IPAddress;
                    const response=await fetch(`http://${ip}/modules/GoogleAuthenticator.js`,{signal:AbortSignal.timeout(3000)});
                    if(response.ok && (await response.text()).includes('Google Authenticator to QR')) {healthy=true;break;}
                } catch { /* nginx may still be starting */ }
                await new Promise(resolve=>setTimeout(resolve,500));
            }
            if(!healthy)throw Error('Custom operation module health check failed');
            const [result]=await db.execute('UPDATE services SET container_image=?, source_repo=?, available_update_version=NULL, updated_at=NOW() WHERE id=? AND container_image=?',[
                value,'https://github.com/3mg/cyberchef-recipes',rows[0].id,rows[0].container_image
            ]);
            if(result.affectedRows!==1)throw Error('NOMAD service changed concurrently');
            console.log(JSON.stringify({status:'deployed',image:value,backupId:id,backupDirectory:directory}));
        } catch(error) {
            // Remove only this new stateless container, then restore the saved one.
            if(replacement)await replacement.remove({force:true}).catch(()=>{});
            await restore(backup, false);
            throw error;
        }
    } else throw Error('Usage: deploy IMAGE or rollback BACKUP_ID');
} finally {await db.end();}
