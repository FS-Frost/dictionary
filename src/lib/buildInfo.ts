import { z } from "zod";

export const BuildInfo = z.object({
    "sha": z.string().default(""),
    "ref": z.string().default(""),
    "actor": z.string().default(""),
});

export type BuildInfo = z.infer<typeof BuildInfo>;

export async function getBuildInfo(): Promise<BuildInfo> {
    const defaultBuildInfo = BuildInfo.parse({});
    const response = await fetch("build-info.json");
    if (!response.ok) {
        // El fichero lo genera CI al desplegar, así que en local y en el build
        // de los e2e no existe. Un 404 aquí es lo esperado, no un fallo: sólo se
        // avisa de los demás códigos, que sí indicarían algo roto.
        if (response.status != 404) {
            console.error(`failed to fetch build info, status ${response.status}`);
        }

        return defaultBuildInfo;
    }

    const maybeBuildInfo = await response.json();
    const parseResult = BuildInfo.safeParse(maybeBuildInfo);
    if (!parseResult.success) {
        console.error("invalid build info", {
            parseResult,
        });
        return defaultBuildInfo;
    }

    return parseResult.data;
}
