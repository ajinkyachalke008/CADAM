import { generate3DModelFilename } from '@/utils/file-utils';
import { Message } from '@shared/types';

interface DownloadOptions {
  content: Blob | string;
  filename: string;
  mimeType?: string;
}

interface GenerateDownloadFilenameOptions {
  currentMessage?: Message | null;
  fallback?: string;
  extension: string;
}

/**
 * Downloads a file by creating a temporary download link
 */
export function downloadFile({
  content,
  filename,
  mimeType = 'application/octet-stream',
}: DownloadOptions): void {
  let blob: Blob;

  if (typeof content === 'string') {
    blob = new Blob([content], { type: mimeType });
  } else {
    blob = content;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates a filename for downloads using the 3D model filename utility
 */
export function generateDownloadFilename({
  currentMessage,
  fallback = 'parametric-model',
  extension,
}: GenerateDownloadFilenameOptions): string {
  const baseName = generate3DModelFilename({
    conversationTitle: undefined,
    assistantMessage: currentMessage || undefined,
    modelName: undefined,
    fallback,
  });

  return `${baseName}.${extension}`;
}

/**
 * Downloads STL file from blob
 */
export function downloadSTLFile(
  output: Blob,
  currentMessage?: Message | null,
): void {
  const filename = generateDownloadFilename({
    currentMessage,
    extension: 'stl',
  });

  downloadFile({
    content: output,
    filename,
    mimeType: 'application/octet-stream',
  });
}

/**
 * Downloads OpenSCAD code as .scad file
 */
export function downloadOpenSCADFile(
  code: string,
  currentMessage?: Message | null,
): void {
  const filename = generateDownloadFilename({
    currentMessage,
    extension: 'scad',
  });

  downloadFile({
    content: code,
    filename,
    mimeType: 'text/plain',
  });
}

/**
 * Converts STL blob to OBJ format and downloads
 */
export async function downloadOBJFile(
  output: Blob,
  currentMessage?: Message | null,
): Promise<void> {
  const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
  const { OBJExporter } = await import('three-stdlib');
  const THREE = await import('three');

  const buffer = await output.arrayBuffer();
  const loader = new STLLoader();
  const geometry = loader.parse(buffer);
  geometry.center();
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);
  const scene = new THREE.Scene();
  scene.add(mesh);

  const exporter = new OBJExporter();
  const objContent = exporter.parse(scene);

  const filename = generateDownloadFilename({
    currentMessage,
    extension: 'obj',
  });

  // Clean up
  geometry.dispose();
  material.dispose();

  downloadFile({
    content: objContent,
    filename,
    mimeType: 'text/plain',
  });
}

/**
 * Converts STL blob to GLB (GLTF Binary) and downloads
 */
export async function downloadGLBFile(
  output: Blob,
  currentMessage?: Message | null,
): Promise<void> {
  const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
  const { GLTFExporter } = await import('three-stdlib');
  const THREE = await import('three');

  const buffer = await output.arrayBuffer();
  const loader = new STLLoader();
  const geometry = loader.parse(buffer);
  geometry.center();
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.1 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'parametric-model';
  const scene = new THREE.Scene();
  scene.add(mesh);

  const exporter = new GLTFExporter();

  const glbBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => resolve(result as ArrayBuffer),
      (error) => reject(error),
      { binary: true },
    );
  });

  const filename = generateDownloadFilename({
    currentMessage,
    extension: 'glb',
  });

  // Clean up
  geometry.dispose();
  material.dispose();

  downloadFile({
    content: new Blob([glbBuffer], { type: 'model/gltf-binary' }),
    filename,
    mimeType: 'model/gltf-binary',
  });
}

/**
 * Converts STL blob to PLY format and downloads
 */
export async function downloadPLYFile(
  output: Blob,
  currentMessage?: Message | null,
): Promise<void> {
  const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
  const { PLYExporter } = await import('three-stdlib');
  const THREE = await import('three');

  const buffer = await output.arrayBuffer();
  const loader = new STLLoader();
  const geometry = loader.parse(buffer);
  geometry.center();
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);
  const scene = new THREE.Scene();
  scene.add(mesh);

  const exporter = new PLYExporter();
  const plyContent = await new Promise<string>((resolve) => {
    exporter.parse(scene, (result) => resolve(result as string), {});
  });

  const filename = generateDownloadFilename({
    currentMessage,
    extension: 'ply',
  });

  // Clean up
  geometry.dispose();
  material.dispose();

  downloadFile({
    content: plyContent,
    filename,
    mimeType: 'application/x-ply',
  });
}

/**
 * Converts STL blob to DXF (2D projection) and downloads
 */
export async function downloadDXFFile(
  output: Blob,
  currentMessage?: Message | null,
): Promise<void> {
  const { STLLoader } = await import('three/addons/loaders/STLLoader.js');

  const buffer = await output.arrayBuffer();
  const loader = new STLLoader();
  const geometry = loader.parse(buffer);
  geometry.center();
  geometry.computeVertexNormals();

  // Project 3D vertices to 2D (top-down XY projection) for DXF
  const positions = geometry.getAttribute('position');
  const lines: string[] = [];
  lines.push('0\nSECTION\n2\nHEADER\n0\nENDSEC');
  lines.push('0\nSECTION\n2\nENTITIES');

  // Write triangles as 3DFACE entities
  for (let i = 0; i < positions.count; i += 3) {
    const x1 = positions.getX(i).toFixed(4);
    const y1 = positions.getY(i).toFixed(4);
    const z1 = positions.getZ(i).toFixed(4);
    const x2 = positions.getX(i + 1).toFixed(4);
    const y2 = positions.getY(i + 1).toFixed(4);
    const z2 = positions.getZ(i + 1).toFixed(4);
    const x3 = positions.getX(i + 2).toFixed(4);
    const y3 = positions.getY(i + 2).toFixed(4);
    const z3 = positions.getZ(i + 2).toFixed(4);

    lines.push(`0\n3DFACE\n8\n0`);
    lines.push(`10\n${x1}\n20\n${y1}\n30\n${z1}`);
    lines.push(`11\n${x2}\n21\n${y2}\n31\n${z2}`);
    lines.push(`12\n${x3}\n22\n${y3}\n32\n${z3}`);
    lines.push(`13\n${x3}\n23\n${y3}\n33\n${z3}`);
  }

  lines.push('0\nENDSEC\n0\nEOF');

  const filename = generateDownloadFilename({
    currentMessage,
    extension: 'dxf',
  });

  geometry.dispose();

  downloadFile({
    content: lines.join('\n'),
    filename,
    mimeType: 'application/dxf',
  });
}

