"use client";

import {
  recordOf,
  type TopicCitationRow,
  type TopicPersonRow,
} from "@countrytopics/contracts";
import {
  CLAIM_STANCES,
  PERSON_ROLE_LABELS,
  STANCE_LABELS,
  TOPIC_PERSON_ROLES,
} from "@countrytopics/domain";

import { type RowProps, SourceFields } from "@/admin/components/EvidenceFields";
import { Field } from "@/admin/components/Field";
import { RelationPicker } from "@/admin/components/RelationPicker";
import { useFieldIdPrefix } from "@/admin/field-id-prefix";
import { fieldProps, pickerAria } from "@/admin/field-text";

// The topic's own rows: its individuals, and the references it cites with
// their stance. Its evidence rows are every editor's (EvidenceFields).

export function PersonFields({
  texts,
  at,
  row,
  onChange,
  refusal,
  readOnly,
}: RowProps<TopicPersonRow>) {
  const prefix = useFieldIdPrefix();
  const individual = fieldProps(texts, `${at}.individual`, refusal, prefix);
  const role = fieldProps(texts, `${at}.role`, refusal, prefix);
  return (
    <div className="admin-fields two">
      <Field {...individual} required>
        <RelationPicker
          id={individual.id}
          collection="individuals"
          value={row.individual ? [row.individual] : []}
          onChange={(chosen) => onChange({ individual: chosen.at(-1) ?? null })}
          toRecord={(match) => recordOf("individuals", match)}
          disabled={readOnly}
          {...pickerAria(individual)}
        />
      </Field>
      <Field {...role} required>
        <select
          id={role.id}
          className="admin-input"
          value={row.role}
          disabled={readOnly}
          {...role.aria}
          onChange={(event) =>
            onChange({ role: event.target.value as TopicPersonRow["role"] })
          }
        >
          {TOPIC_PERSON_ROLES.map((value) => (
            <option key={value} value={value}>
              {PERSON_ROLE_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

export function CitationFields(props: RowProps<TopicCitationRow>) {
  const { texts, at, row, onChange, refusal, readOnly } = props;
  const stance = fieldProps(texts, `${at}.stance`, refusal, useFieldIdPrefix());
  return (
    <SourceFields
      {...props}
      beside={
        <Field {...stance} required>
          <select
            id={stance.id}
            className="admin-input"
            value={row.stance}
            disabled={readOnly}
            {...stance.aria}
            onChange={(event) =>
              onChange({
                stance: event.target.value as TopicCitationRow["stance"],
              })
            }
          >
            {CLAIM_STANCES.map((value) => (
              <option key={value} value={value}>
                {STANCE_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
      }
    />
  );
}
