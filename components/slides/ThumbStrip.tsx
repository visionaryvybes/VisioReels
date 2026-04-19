'use client';

import { useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SlideFrame, type SlideData } from './SlideFrame';
import type { SlideAspect, SlidePreset } from '@/lib/slide-presets';

export function ThumbStrip({
  slides,
  ids,
  preset,
  aspect,
  brand,
  width,
  selectedIdx,
  onSelect,
  onReorder,
}: {
  slides: SlideData[];
  ids: string[];
  preset: SlidePreset;
  aspect: SlideAspect;
  brand: string;
  width: number;
  selectedIdx: number;
  onSelect: (i: number) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const items = useMemo(() => ids, [ids]);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.indexOf(String(active.id));
    const to = items.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(from, to);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items} strategy={horizontalListSortingStrategy}>
        <div style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          paddingBottom: 10,
          paddingInline: 2,
          WebkitOverflowScrolling: 'touch',
        }}>
          {slides.map((s, i) => (
            <SortableThumb
              key={items[i]}
              id={items[i]}
              slide={s}
              preset={preset}
              aspect={aspect}
              brand={brand}
              width={width}
              index={i}
              total={slides.length}
              selected={i === selectedIdx}
              onSelect={() => onSelect(i)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableThumb(props: {
  id: string;
  slide: SlideData;
  preset: SlidePreset;
  aspect: SlideAspect;
  brand: string;
  width: number;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    cursor: isDragging ? 'grabbing' : 'grab',
    touchAction: 'none',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#555', letterSpacing: '0.18em' }}>
        #{String(props.index + 1).padStart(2, '0')}
      </div>
      <SlideFrame
        slide={props.slide}
        preset={props.preset}
        aspect={props.aspect}
        index={props.index}
        total={props.total}
        brand={props.brand}
        width={props.width}
        selected={props.selected}
        onSelect={props.onSelect}
      />
    </div>
  );
}

export { arrayMove };
