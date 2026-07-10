import {api} from "../api";

import {
    getOutbox,
    clearOutbox,
    setMapping,
    getMapping,
    removeTaskLocal,
    promoteLocalToServer,
} from "./db";

let syncing = false; //Evita paralelizar sincronizaciones
let lastSync = 0; //Para evitar sincronizar cada vez que se recupera la conexión, si ya se hizo en los últimos 30 segundos

export async function syncNow() {
    if (!navigator.onLine) return; // No tiene sentido intentar sincronizar sin conexión

    const now = Date.now();
    if (now - lastSync < 15000) return; // Evita sincronizar si ya se hizo hace menos de 30 segundos
    lastSync = now;

    if (syncing) return; // Ya hay una sincronización en curso
    syncing = true;

    try {
        const ops = (await getOutbox() as any[]).sort((a, b) => a.ts - b.ts); // Ordenar por fecha para mantener el orden de las operaciones
        if (ops.length === 0) return; // Nada que sincronizar

        const toSync: any[] = [];
        for (const op of ops) {
            if (op.op === "create") {
                toSync.push({
                    clienteId: op.clienteId,
                    title: op.data.title,
                    description: op.data.description ?? "",
                    status: op.data.status ?? "Pendiente",
                });
            } else if (op.op === "update") {
                // Para update y delete necesitamos el serverId, si no lo tenemos es que el create aún no se ha sincronizado, así que lo dejamos para la próxima vez
                const cid = op.clienteId;
                if(cid) {
                    toSync.push({
                        clienteId: cid,
                        title: op.data.title,
                        decription: op.data.description,
                        status: op.data.status,
                    });
                } else if(op.serverId) {
                    try {
                        await api.put(`/tasks/${op.serverId}`, op.data);
                    } catch {
                        // Si falla el update, no hacemos nada, se intentará de nuevo la próxima vez
                    }
                }
            }
        }

        if (toSync.length) {
            try {
                const {data} = await api.post("/tasks/bulksync", { tasks: toSync });
                for (const map of data?._maping || []) {
                    await setMapping(map.clienteId, map.serverId);
                    await promoteLocalToServer(map.clienteId, map.serverId);
                }
            } catch {
                // Si falla el sync, no hacemos nada, se intentará de nuevo la próxima vez
                return;
            }
        }

        //Proceso deletes por separado porque no necesitan clienteId, solo serverId
        for (const op of ops) {
            if (op.op !== "delete") continue;
            const serverId =op.serverId ?? (op.clienteId ? await getMapping(op.clienteId) : undefined);
            if (!serverId) continue; // Si no tenemos serverId, es que el create aún no se ha sincronizado, así que lo dejamos para la próxima vez
            try {
                await api.delete(`/tasks/${serverId}`);
                await removeTaskLocal(op.clienteId);
            } catch {
                // Si falla el delete, no hacemos nada, se intentará de nuevo la próxima vez
            }
        }

        // Si llegamos hasta aquí, es que todas las operaciones se han sincronizado correctamente, así que podemos limpiar el outbox
        await clearOutbox();
        } finally {
            syncing = false;
        }
}

// Suscripcion dispara sync al reconectarse
export function setupOnlineSync() {
    const handler = () => {
        void syncNow(); // Lanzar sincronización pero no esperar a que termine, para no bloquear el hilo principal
    };
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
}