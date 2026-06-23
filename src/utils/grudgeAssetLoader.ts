import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { retargetClip } from "three/examples/jsm/utils/SkeletonUtils.js";

const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();

export function isFbxUrl(url: string): boolean {
    return /\.fbx(\?|$)/i.test(url);
}

function convertPhongToStandard(material: THREE.Material): THREE.Material {
    if (!(material instanceof THREE.MeshPhongMaterial)) return material;
    const std = new THREE.MeshStandardMaterial({
        color: material.color.clone(),
        map: material.map,
        side: material.side,
        transparent: material.transparent,
        opacity: material.opacity,
        alphaTest: material.alphaTest,
        roughness: 0.7,
        metalness: 0.05,
        name: material.name,
    });
    if (material.emissive) std.emissive.copy(material.emissive);
    if (material.emissiveMap) std.emissiveMap = material.emissiveMap;
    if (material.normalMap) std.normalMap = material.normalMap;
    return std;
}

function prepareFbxScene(group: THREE.Group): void {
    group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh || (child as THREE.SkinnedMesh).isSkinnedMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            const mesh = child as THREE.Mesh;
            if (Array.isArray(mesh.material)) {
                mesh.material = mesh.material.map(convertPhongToStandard);
            } else {
                mesh.material = convertPhongToStandard(mesh.material);
            }
        }
    });
}

function findSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
    let found: THREE.SkinnedMesh | null = null;
    root.traverse((node) => {
        if (found) return;
        if ((node as THREE.SkinnedMesh).isSkinnedMesh && (node as THREE.SkinnedMesh).skeleton?.bones?.length) {
            found = node as THREE.SkinnedMesh;
        }
    });
    return found;
}

export async function loadModelAsset(url: string): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> {
    if (isFbxUrl(url)) {
        const group = await fbxLoader.loadAsync(url);
        prepareFbxScene(group);
        return { scene: group, animations: group.animations ?? [] };
    }
    const gltf = await gltfLoader.loadAsync(url) as GLTF;
    return { scene: gltf.scene, animations: gltf.animations ?? [] };
}

export async function loadExternalAnimationClips(
    animationUrls: Record<string, string>,
    targetScene: THREE.Object3D,
): Promise<THREE.AnimationClip[]> {
    const targetMesh = findSkinnedMesh(targetScene);
    const clips: THREE.AnimationClip[] = [];

    for (const [logicalName, url] of Object.entries(animationUrls)) {
        const { scene: sourceScene, animations } = await loadModelAsset(url);
        const sourceClip = animations[0];
        if (!sourceClip) continue;

        sourceClip.name = logicalName;
        const sourceMesh = findSkinnedMesh(sourceScene);

        if (targetMesh && sourceMesh) {
            try {
                const retargeted = retargetClip(targetMesh, sourceMesh, sourceClip, {
                    hip: "Bip001 Pelvis",
                    hipInfluence: new THREE.Vector3(0, 0, 0),
                    preserveBonePositions: true,
                } as Parameters<typeof retargetClip>[3]);
                retargeted.name = logicalName;
                clips.push(retargeted);
                continue;
            } catch {
                // fall through to raw clip
            }
        }
        clips.push(sourceClip);
    }

    return clips;
}