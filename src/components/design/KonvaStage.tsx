/* eslint-disable react-hooks/refs */
'use client';

/**
 * KonvaStage — the Design Studio canvas, on Konva (react-konva).
 *
 * This is the ONE stage the studio renders. It replaces the hand-rolled
 * SVG overlay that used to sit on top of an <img>: the product photo is a
 * Konva.Image, the print area is a Konva rect + label, and every design
 * layer (text / image / shape / freehand draw) is a real Konva node —
 * draggable when the Select tool is armed, selectable on click.
 *
 * Coordinates: everything inside the Stage is in BASE-IMAGE pixels
 * (the loaded photo's natural size). The Stage itself is scaled by the
 * `scale` prop (fit-to-wrap × zoom), so pointer math divides the
 * container position by `scale` to get back to image pixels, and layer
 * drag positions come back in image pixels too (Konva accounts for the
 * Stage scale during drag). Layer inches live in the caller; this file
 * only ever sees pixels (xIn * ppi, passed in as x/y/w/h via `layers`).
 *
 * Loaded through next/dynamic with ssr:false from DesignCanvasScreen —
 * Konva touches the DOM at import time and must never run on the server.
 */
import { useEffect, useRef } from 'react';
import Konva from 'konva';
import {
  Arrow,
  Ellipse,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Path,
  Rect,
  RegularPolygon,
  Ring,
  Stage,
  Star,
  Text as KonvaText,
} from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';

export interface KonvaLayerInput {
  uid: string;
  kind: 'image' | 'text' | 'shape';
  assetId?: string;
  remoteUrl?: string;
  text?: { value: string; fontId: string; sizeIn: number; fill: string };
  render?: 'rect' | 'rectRound' | 'ellipse' | 'triangle' | 'line' | 'arrow' | 'star' | 'heart' | 'ring' | 'diamond' | 'draw';
  fill?: string;
  /** Freehand points, in inches RELATIVE to the layer origin (xIn/yIn). */
  pointsIn?: { x: number; y: number }[];
  view: string;
  xIn: number;
  yIn: number;
  wIn: number;
  hIn: number;
  rotationDeg: number;
  z: number;
}

export interface KonvaStageProps {
  /** Base-image size in natural pixels. */
  imgW: number;
  imgH: number;
  /** Stage size in container pixels (imgW * scale). */
  width: number;
  height: number;
  /** Fit-to-wrap × zoom. */
  scale: number;
  /** Image px per inch for the active view. */
  ppi: number;
  /** Loaded product photo, or null when it failed to load. */
  baseImg: HTMLImageElement | null;
  /** True when the photo failed to load — draw a neutral base instead. */
  baseMissing: boolean;
  /** Outline view: muted photo (grayscale + brighten + low opacity). */
  skeletonView: boolean;
  printRect: { left: number; top: number; width: number; height: number } | null;
  boxLabel: string;
  layers: KonvaLayerInput[];
  /** assetId → the asset's URL (for image layers). */
  assetUrls: Record<string, string>;
  /** URL → loaded image element (assets + remote previews). */
  layerImgs: Record<string, HTMLImageElement>;
  selectedUid: string | null;
  tool: string;
  draft: { x1: number; y1: number; x2: number; y2: number } | null;
  drawPts: { x: number; y: number }[] | null;
  onStageDown: (p: { x: number; y: number }, isStage: boolean) => void;
  onStageMove: (p: { x: number; y: number }) => void;
  onStageUp: () => void;
  onLayerSelect: (uid: string) => void;
  onLayerDragEnd: (uid: string, xIn: number, yIn: number) => void;
}

export default function KonvaStage({
  imgW,
  imgH,
  width,
  height,
  scale,
  ppi,
  baseImg,
  baseMissing,
  skeletonView,
  printRect,
  boxLabel,
  layers,
  assetUrls,
  layerImgs,
  selectedUid,
  tool,
  draft,
  drawPts,
  onStageDown,
  onStageMove,
  onStageUp,
  onLayerSelect,
  onLayerDragEnd,
}: KonvaStageProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const baseNodeRef = useRef<Konva.Image>(null);

  // Outline view: grayscale + brighten the photo through Konva filters.
  // cache() reads pixels, so a cross-origin photo without CORS headers
  // throws — catch it and fall back to opacity-only muting. The photo
  // still shows; the view just isn't grayscale.
  useEffect(() => {
    const node = baseNodeRef.current;
    if (!node || !baseImg) return;
    if (skeletonView) {
      node.filters([Konva.Filters.Grayscale, Konva.Filters.Brighten]);
      node.brightness(0.6);
      try {
        node.cache();
      } catch {
        node.filters([]);
        node.clearCache();
      }
    } else {
      node.filters([]);
      try {
        node.clearCache();
      } catch {
        /* already uncached */
      }
    }
  }, [skeletonView, baseImg]);

  // The release is caught on the WINDOW, not just the stage: a drag can
  // end outside the stage — the right dock panel overlaps the canvas, so
  // any release under it never reaches the stage's own mouseup. The rect
  // and draw tools both lost their commit this way (the draft preview
  // rendered, the mouseup vanished, the layer never existed). onStageUp
  // is a no-op when no drag is active, so a double fire with the stage
  // handler (pointerup then mouseup) is harmless.
  const onStageUpRef = useRef(onStageUp);
  
  useEffect(() => {
    onStageUpRef.current = onStageUp; const up = () => onStageUpRef.current();
    window.addEventListener('pointerup', up);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  const getPos = (e: KonvaEventObject<MouseEvent | TouchEvent>): { x: number; y: number } | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const p = stage.getPointerPosition();
    if (!p) return null;
    return { x: p.x / scale, y: p.y / scale };
  };

  const renderShape = (l: KonvaLayerInput, w: number, h: number): React.ReactNode => {
    const fill = l.fill ?? '#111111';
    const shapeStroke = fill === '#ffffff' ? '#111111' : fill;
    const cx = w / 2;
    const cy = h / 2;
    const min = Math.max(Math.min(w, h), 1);
    switch (l.render) {
      case 'ellipse':
        return <Ellipse x={cx} y={cy} radiusX={w / 2} radiusY={h / 2} fill={fill} />;
      case 'triangle':
        return (
          <RegularPolygon
            x={cx}
            y={cy}
            sides={3}
            radius={min / 2}
            rotation={-90}
            scaleX={w / min}
            scaleY={h / min}
            fill={fill}
          />
        );
      case 'line':
        return (
          <Line
            points={[0, h / 2, w, h / 2]}
            stroke={shapeStroke}
            strokeWidth={Math.max(3, h / 6)}
            lineCap="round"
          />
        );
      case 'arrow':
        return (
          <Arrow
            points={[0, h / 2, w, h / 2]}
            pointerLength={Math.max(10, w * 0.2)}
            pointerWidth={Math.max(10, h * 0.4)}
            fill={fill}
            stroke={shapeStroke}
            strokeWidth={Math.max(3, h / 6)}
          />
        );
      case 'star':
        return (
          <Star
            x={cx}
            y={cy}
            numPoints={5}
            innerRadius={min * 0.22}
            outerRadius={min / 2}
            scaleX={w / min}
            scaleY={h / min}
            fill={fill}
          />
        );
      case 'heart':
        return (
          <Path
            data="M50 88 C20 70 5 50 12 30 C18 14 38 12 50 28 C62 12 82 14 88 30 C95 50 80 70 50 88 Z"
            scaleX={w / 100}
            scaleY={h / 100}
            fill={fill}
          />
        );
      case 'ring':
        return (
          <Ring
            x={cx}
            y={cy}
            innerRadius={min * 0.33}
            outerRadius={min / 2}
            scaleX={w / min}
            scaleY={h / min}
            fill={shapeStroke}
          />
        );
      case 'diamond':
        return (
          <RegularPolygon
            x={cx}
            y={cy}
            sides={4}
            radius={min / 2}
            scaleX={w / min}
            scaleY={h / min}
            fill={fill}
          />
        );
      case 'draw': {
        const pts = (l.pointsIn ?? []).flatMap((p) => [p.x * ppi, p.y * ppi]);
        return pts.length >= 4 ? (
          <Line points={pts} stroke={fill} strokeWidth={3} lineCap="round" lineJoin="round" />
        ) : null;
      }
      case 'rectRound':
        return <Rect width={w} height={h} cornerRadius={min / 4} fill={fill} />;
      default:
        return <Rect width={w} height={h} fill={fill} />;
    }
  };

  const renderLayer = (l: KonvaLayerInput) => {
    const x = l.xIn * ppi;
    const y = l.yIn * ppi;
    const w = l.wIn * ppi;
    const h = l.hIn * ppi;
    const sel = l.uid === selectedUid;
    let inner: React.ReactNode = null;
    if (l.kind === 'text' && l.text) {
      const fontSize = Math.min(l.text.sizeIn * ppi, h);
      inner = (
        <KonvaText
          width={Math.max(w, 40)}
          fontFamily={`${l.text.fontId}, Inter, system-ui, sans-serif`}
          fontSize={fontSize}
          fill={l.text.fill}
          text={l.text.value}
        />
      );
    } else if (l.kind === 'image') {
      const url = l.remoteUrl ?? (l.assetId ? assetUrls[l.assetId] : undefined);
      const img = url ? layerImgs[url] : undefined;
      inner = img ? (
        <KonvaImage image={img} width={w} height={h} />
      ) : (
        <Rect width={w} height={h} fill="#e8e2f4" stroke="#b0a8cc" dash={[4, 3]} />
      );
    } else {
      inner = renderShape(l, w, h);
    }
    return (
      <Group
        key={l.uid}
        x={x}
        y={y}
        rotation={l.rotationDeg}
        draggable={tool === 'select'}
        onClick={(e) => {
          e.cancelBubble = true;
          onLayerSelect(l.uid);
        }}
        onTap={(e) => {
          e.cancelBubble = true;
          onLayerSelect(l.uid);
        }}
        onDragEnd={(e) => {
          onLayerDragEnd(l.uid, e.target.x() / ppi, e.target.y() / ppi);
        }}
      >
        {inner}
        {sel && (
          <Rect
            x={-3}
            y={-3}
            width={w + 6}
            height={h + 6}
            fill="transparent"
            stroke="#0a6400"
            strokeWidth={2}
            dash={[4, 3]}
          />
        )}
      </Group>
    );
  };

  const renderDraft = () => {
    if (drawPts && drawPts.length >= 2) {
      return (
        <Line
          points={drawPts.flatMap((p) => [p.x, p.y])}
          stroke="#0a6400"
          strokeWidth={3}
          lineCap="round"
          lineJoin="round"
        />
      );
    }
    if (!draft) return null;
    const x = Math.min(draft.x1, draft.x2);
    const y = Math.min(draft.y1, draft.y2);
    const w = Math.abs(draft.x2 - draft.x1);
    const h = Math.abs(draft.y2 - draft.y1);
    const common: { fill: string; stroke: string; dash: number[] } = {
      fill: 'rgba(10,100,0,0.25)',
      stroke: '#0a6400',
      dash: [5, 4],
    };
    if (tool === 'ellipse')
      return <Ellipse x={x + w / 2} y={y + h / 2} radiusX={w / 2} radiusY={h / 2} {...common} />;
    if (tool === 'line')
      return (
        <Line points={[draft.x1, draft.y1, draft.x2, draft.y2]} stroke="#0a6400" strokeWidth={4} lineCap="round" />
      );
    if (tool === 'arrow')
      return (
        <Arrow
          points={[draft.x1, draft.y1, draft.x2, draft.y2]}
          pointerLength={14}
          pointerWidth={14}
          fill="#0a6400"
          stroke="#0a6400"
          strokeWidth={4}
        />
      );
    if (tool === 'triangle')
      return (
        <RegularPolygon
          x={x + w / 2}
          y={y + h / 2}
          sides={3}
          radius={Math.max(w, h) / 2}
          rotation={-90}
          scaleX={w / Math.max(Math.max(w, h), 1)}
          scaleY={h / Math.max(Math.max(w, h), 1)}
          {...common}
        />
      );
    return <Rect x={x} y={y} width={Math.max(w, 12)} height={Math.max(h, 12)} {...common} />;
  };

  const labelH = imgH * 0.026;
  const labelFont = imgH * 0.018;

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      scaleX={scale}
      scaleY={scale}
      onMouseDown={(e) => {
        const p = getPos(e);
        if (p) onStageDown(p, e.target === stageRef.current);
      }}
      onTouchStart={(e) => {
        const p = getPos(e);
        if (p) onStageDown(p, e.target === stageRef.current);
      }}
      onMouseMove={(e) => {
        const p = getPos(e);
        if (p) onStageMove(p);
      }}
      onTouchMove={(e) => {
        const p = getPos(e);
        if (p) onStageMove(p);
      }}
      onMouseUp={() => onStageUp()}
      onTouchEnd={() => onStageUp()}
    >
      <Layer>
        {baseImg ? (
          <KonvaImage
            ref={baseNodeRef}
            image={baseImg}
            width={imgW}
            height={imgH}
            opacity={skeletonView ? 0.25 : 1}
          />
        ) : (
          <Group>
            {/* No white backing object: the canvas is the product photo
                when it loads, and the print area + layers when it doesn't.
                A blank white rectangle pretends to be the item — it comes
                out (Sunny's standing correction). The message below is
                status, not a shape. */}
            {baseMissing && (
              <KonvaText
                x={20}
                y={20}
                width={imgW - 40}
                fontSize={16}
                fill="#5a6355"
                text="Product photo could not load — the print area below is the real one for this product."
              />
            )}
          </Group>
        )}
        {printRect && (
          <Group>
            <Rect
              x={printRect.left}
              y={printRect.top}
              width={printRect.width}
              height={printRect.height}
              fill="transparent"
              stroke="#0a6400"
              strokeWidth={Math.max(1.5, imgW / 500)}
              dash={[imgW / 90, imgW / 140]}
            />
            <Rect
              x={printRect.left}
              y={printRect.top - imgH * 0.028}
              width={Math.max(imgW * 0.16, boxLabel.length * imgW * 0.0088 + imgW * 0.016)}
              height={labelH}
              fill="#0a6400"
              cornerRadius={imgW * 0.004}
            />
            <KonvaText
              x={printRect.left + imgW * 0.008}
              y={printRect.top - imgH * 0.028 + (labelH - labelFont) / 2}
              fontSize={labelFont}
              fontStyle="bold"
              fill="#ffffff"
              text={boxLabel}
            />
          </Group>
        )}
        {layers.map(renderLayer)}
        {renderDraft()}
      </Layer>
    </Stage>
  );
}
