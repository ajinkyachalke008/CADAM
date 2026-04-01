import { RefreshCcw, Download, ChevronUp, Loader2 } from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Message, Parameter } from '@shared/types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ParameterInput } from '@/components/parameter/ParameterInput';
import { ColorPicker } from '@/components/parameter/ColorPicker';
import { validateParameterValue } from '@/utils/parameterUtils';
import { useCurrentMessage } from '@/contexts/CurrentMessageContext';
import {
  downloadSTLFile,
  downloadOpenSCADFile,
  downloadOBJFile,
  downloadGLBFile,
  downloadPLYFile,
  downloadDXFFile,
} from '@/utils/downloadUtils';

type DownloadFormat = 'stl' | 'scad' | 'obj' | 'glb' | 'ply' | 'dxf';

const FORMAT_INFO: Record<DownloadFormat, { label: string; desc: string; needsOutput: boolean; needsCode: boolean }> = {
  stl:  { label: '.STL',  desc: '3D Printing',       needsOutput: true,  needsCode: false },
  obj:  { label: '.OBJ',  desc: 'Universal 3D',      needsOutput: true,  needsCode: false },
  glb:  { label: '.GLB',  desc: 'Modern 3D Apps',     needsOutput: true,  needsCode: false },
  ply:  { label: '.PLY',  desc: 'Point Cloud / Scan', needsOutput: true,  needsCode: false },
  dxf:  { label: '.DXF',  desc: 'CAD / CNC',          needsOutput: true,  needsCode: false },
  scad: { label: '.SCAD', desc: 'OpenSCAD Source',    needsOutput: false, needsCode: true  },
};

interface ParameterSectionProps {
  parameters: Parameter[];
  onSubmit: (message: Message | null, parameters: Parameter[]) => void;
  currentOutput?: Blob;
  color: string;
  setColor: (color: string) => void;
}

export function ParameterSection({
  parameters,
  onSubmit,
  currentOutput,
  color,
  setColor,
}: ParameterSectionProps) {
  const { currentMessage } = useCurrentMessage();
  const [selectedFormat, setSelectedFormat] = useState<DownloadFormat>('stl');
  const [isDownloading, setIsDownloading] = useState(false);

  // Debounce timer for compilation
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingParametersRef = useRef<Parameter[] | null>(null);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Debounced submit function
  const debouncedSubmit = useCallback(
    (params: Parameter[]) => {
      // Store the parameters to submit
      pendingParametersRef.current = params;

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new debounced timer (200ms delay)
      debounceTimerRef.current = setTimeout(() => {
        if (pendingParametersRef.current) {
          onSubmit(currentMessage, pendingParametersRef.current);
          pendingParametersRef.current = null;
        }
      }, 200);
    },
    [onSubmit, currentMessage],
  );

  const handleCommit = (param: Parameter, value: Parameter['value']) => {
    const validatedValue = validateParameterValue(param, value);

    const updatedParam = { ...param, value: validatedValue };
    const updatedParameters = parameters.map((p) =>
      p.name === param.name ? updatedParam : p,
    );

    debouncedSubmit(updatedParameters);
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      switch (selectedFormat) {
        case 'stl':
          if (currentOutput) downloadSTLFile(currentOutput, currentMessage);
          break;
        case 'scad':
          if (currentMessage?.content.artifact?.code)
            downloadOpenSCADFile(currentMessage.content.artifact.code, currentMessage);
          break;
        case 'obj':
          if (currentOutput) await downloadOBJFile(currentOutput, currentMessage);
          break;
        case 'glb':
          if (currentOutput) await downloadGLBFile(currentOutput, currentMessage);
          break;
        case 'ply':
          if (currentOutput) await downloadPLYFile(currentOutput, currentMessage);
          break;
        case 'dxf':
          if (currentOutput) await downloadDXFFile(currentOutput, currentMessage);
          break;
      }
    } catch (error) {
      console.error(`Error downloading ${selectedFormat}:`, error);
    } finally {
      setIsDownloading(false);
    }
  };

  const formatMeta = FORMAT_INFO[selectedFormat];
  const isDownloadDisabled =
    isDownloading ||
    (formatMeta.needsOutput && !currentOutput) ||
    (formatMeta.needsCode && !currentMessage?.content.artifact?.code);

  return (
    <div className="h-full w-full max-w-full border-l border-gray-200/20 bg-adam-bg-secondary-dark dark:border-gray-800">
      <div className="flex h-14 items-center justify-between border-b border-adam-neutral-700 bg-gradient-to-r from-adam-bg-secondary-dark to-adam-bg-secondary-dark/95 px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight text-adam-text-primary">
            Parameters
          </span>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 w-8 rounded-full p-0 text-adam-text-primary transition-colors [@media(hover:hover)]:hover:bg-adam-neutral-950 [@media(hover:hover)]:hover:text-adam-neutral-10"
                disabled={parameters.length === 0}
                onClick={() => {
                  const newParameters = parameters.map((param) => ({
                    ...param,
                    value: param.defaultValue,
                  }));
                  onSubmit(currentMessage, newParameters);
                }}
              >
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Reset all parameters</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex h-[calc(100%-3.5rem)] flex-col justify-between overflow-hidden">
        <ScrollArea className="flex-1 px-6 py-6">
          <div className="flex flex-col gap-3">
            {parameters.map((param) => (
              <ParameterInput
                key={param.name}
                param={param}
                handleCommit={handleCommit}
              />
            ))}
          </div>
        </ScrollArea>
        <div className="flex flex-col gap-4 border-t border-adam-neutral-700 px-6 py-6">
          <div>
            <ColorPicker color={color} onChange={setColor} />
          </div>
          <div className="flex">
            <Button
              onClick={handleDownload}
              disabled={isDownloadDisabled}
              aria-label={`download ${selectedFormat.toUpperCase()} file`}
              className="h-12 flex-1 rounded-r-none bg-adam-neutral-50 text-adam-neutral-800 hover:bg-adam-neutral-100 hover:text-adam-neutral-900"
            >
              {isDownloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {isDownloading ? 'Exporting...' : selectedFormat.toUpperCase()}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  disabled={
                    !currentOutput && !currentMessage?.content.artifact?.code
                  }
                  aria-label="select download format"
                  className="h-12 w-12 rounded-l-none border-l border-adam-neutral-300 bg-adam-neutral-50 p-0 text-adam-neutral-800 hover:bg-adam-neutral-100 hover:text-adam-neutral-900"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-72 border-none bg-adam-neutral-800 shadow-md"
              >
                <div className="px-3 py-2">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-adam-text-primary/40">3D Model Formats</span>
                </div>
                <DropdownMenuItem
                  onClick={() => setSelectedFormat('stl')}
                  disabled={!currentOutput}
                  className="cursor-pointer text-adam-text-primary"
                >
                  <span className="text-sm font-medium">.STL</span>
                  <span className="ml-3 text-xs text-adam-text-primary/60">
                    3D Printing
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSelectedFormat('obj')}
                  disabled={!currentOutput}
                  className="cursor-pointer text-adam-text-primary"
                >
                  <span className="text-sm font-medium">.OBJ</span>
                  <span className="ml-3 text-xs text-adam-text-primary/60">
                    Universal 3D
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSelectedFormat('glb')}
                  disabled={!currentOutput}
                  className="cursor-pointer text-adam-text-primary"
                >
                  <span className="text-sm font-medium">.GLB</span>
                  <span className="ml-3 text-xs text-adam-text-primary/60">
                    Modern 3D Apps
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSelectedFormat('ply')}
                  disabled={!currentOutput}
                  className="cursor-pointer text-adam-text-primary"
                >
                  <span className="text-sm font-medium">.PLY</span>
                  <span className="ml-3 text-xs text-adam-text-primary/60">
                    Point Cloud / Scan
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-adam-neutral-700" />
                <div className="px-3 py-2">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-adam-text-primary/40">CAD Formats</span>
                </div>
                <DropdownMenuItem
                  onClick={() => setSelectedFormat('dxf')}
                  disabled={!currentOutput}
                  className="cursor-pointer text-adam-text-primary"
                >
                  <span className="text-sm font-medium">.DXF</span>
                  <span className="ml-3 text-xs text-adam-text-primary/60">
                    CAD / CNC
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSelectedFormat('scad')}
                  disabled={!currentMessage?.content.artifact?.code}
                  className="cursor-pointer text-adam-text-primary"
                >
                  <span className="text-sm font-medium">.SCAD</span>
                  <span className="ml-3 text-xs text-adam-text-primary/60">
                    OpenSCAD Source
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}

