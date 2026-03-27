import { truncateAnnotationSummary, type Annotation, type AnnotationDraft, type DiffAnnotation, type TextAnnotation } from "../types.js";

export function materializeAnnotations(drafts: AnnotationDraft[]): { annotations: Annotation[]; nextAnnotationNumber: number } {
  const annotations = drafts.map((draft, index) => materializeAnnotation(draft, index + 1));
  return {
    annotations,
    nextAnnotationNumber: annotations.length + 1
  };
}

export function materializeAnnotation(draft: AnnotationDraft, annotationNumber: number): Annotation {
  const id = `A${annotationNumber}`;

  if (draft.kind === "diff") {
    const annotation: DiffAnnotation = {
      ...draft,
      id,
      summary: truncateAnnotationSummary(draft.comment)
    };
    return annotation;
  }

  const annotation: TextAnnotation = {
    ...draft,
    id,
    summary: truncateAnnotationSummary(draft.comment)
  };
  return annotation;
}

export function annotationsToDrafts(annotations: Annotation[]): AnnotationDraft[] {
  return annotations.map(({ id: _id, summary: _summary, ...draft }) => draft);
}

export function updateAnnotationComment(annotations: Annotation[], annotationId: string, comment: string): Annotation[] {
  return annotations.map((annotation) => {
    if (annotation.id !== annotationId) {
      return annotation;
    }

    return {
      ...annotation,
      comment,
      summary: truncateAnnotationSummary(comment)
    };
  });
}

export function removeAnnotation(annotations: Annotation[], annotationId: string): Annotation[] {
  return annotations.filter((annotation) => annotation.id !== annotationId);
}
