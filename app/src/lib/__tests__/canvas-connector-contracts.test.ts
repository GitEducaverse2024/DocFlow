import { describe, it, expect } from 'vitest';
import {
  CONNECTOR_CONTRACTS,
  getConnectorContracts,
  type ConnectorContract,
  type ConnectorAction,
} from '../services/canvas-connector-contracts';

describe('CONNECTOR_CONTRACTS', () => {
  describe('gmail connector', () => {
    const gmail = getConnectorContracts('gmail');

    it('test 1: exposes all 4 Gmail actions', () => {
      expect(gmail).not.toBeNull();
      expect(gmail!.contracts).toHaveProperty('send_report');
      expect(gmail!.contracts).toHaveProperty('send_reply');
      expect(gmail!.contracts).toHaveProperty('mark_read');
      expect(gmail!.contracts).toHaveProperty('forward');
    });

    it('test 2: send_report required_fields contains accion_final, report_to, results', () => {
      const req = [...gmail!.contracts.send_report.required_fields].sort();
      expect(req).toEqual(['accion_final', 'report_to', 'results'].sort());
    });

    it('test 3: send_report optional_fields contains report_subject, report_template_ref', () => {
      const opt = [...gmail!.contracts.send_report.optional_fields].sort();
      expect(opt).toEqual(['report_subject', 'report_template_ref'].sort());
    });

    it('test 4: send_reply required + optional fields match canvas-executor', () => {
      const req = [...gmail!.contracts.send_reply.required_fields].sort();
      expect(req).toEqual(
        ['accion_final', 'respuesta.email_destino', 'respuesta.producto'].sort()
      );
      const opt = [...gmail!.contracts.send_reply.optional_fields].sort();
      expect(opt).toEqual(
        [
          'messageId',
          'threadId',
          'reply_mode',
          'respuesta.saludo',
          'respuesta.cuerpo',
          'respuesta.asunto',
          'respuesta.plantilla_ref',
        ].sort()
      );
    });

    it('test 5: mark_read required_fields = [accion_final, messageId]', () => {
      const req = [...gmail!.contracts.mark_read.required_fields].sort();
      expect(req).toEqual(['accion_final', 'messageId'].sort());
    });

    it('test 6: forward required + optional fields match canvas-executor', () => {
      const req = [...gmail!.contracts.forward.required_fields].sort();
      expect(req).toEqual(['accion_final', 'forward_to'].sort());
      const opt = [...gmail!.contracts.forward.optional_fields].sort();
      expect(opt).toEqual(
        ['subject', 'resumen_derivacion', 'resumen_consulta', 'body', 'messageId'].sort()
      );
    });

    it('test 7: each Gmail action has non-empty description and source_line_ref', () => {
      for (const [name, action] of Object.entries(gmail!.contracts)) {
        expect(action.description, `${name} description`).toBeTruthy();
        expect(typeof action.description).toBe('string');
        expect(action.description.length).toBeGreaterThan(0);
        expect(action.source_line_ref).toMatch(/canvas-executor\.ts:/);
      }
    });

    it('test 12 (regression guard): send_report fields cover all actionData.X reads from canvas-executor.ts Gmail send_report branch', () => {
      // Derived line-by-line from <interfaces> block in 134-01 PLAN.
      // If canvas-executor.ts renames a field, this test must be updated
      // in sync with the contracts module — or it breaks.
      const allFieldsDeclared = new Set<string>([
        ...gmail!.contracts.send_report.required_fields,
        ...gmail!.contracts.send_report.optional_fields,
      ]);
      const mustContain = [
        'accion_final',
        'report_to',
        'report_subject',
        'report_template_ref',
        'results',
      ];
      for (const field of mustContain) {
        expect(
          allFieldsDeclared.has(field),
          `send_report must declare ${field}`
        ).toBe(true);
      }
    });
  });

  describe('google_drive connector', () => {
    it('test 9: exposes drive operations with node.data fields', () => {
      const drive = getConnectorContracts('google_drive');
      expect(drive).not.toBeNull();
      expect(drive!.contracts).toHaveProperty('upload');
      expect(drive!.contracts).toHaveProperty('download');
      expect(drive!.contracts).toHaveProperty('list');
      expect(drive!.contracts).toHaveProperty('create_folder');

      const allFields = new Set<string>();
      for (const action of Object.values(drive!.contracts)) {
        action.required_fields.forEach((f) => allFields.add(f));
        action.optional_fields.forEach((f) => allFields.add(f));
      }
      expect(allFields.has('drive_operation')).toBe(true);
      expect(allFields.has('drive_folder_id')).toBe(true);
      expect(allFields.has('drive_file_name')).toBe(true);
      expect(allFields.has('drive_file_id')).toBe(true);
      expect(allFields.has('drive_mime_type')).toBe(true);

      // download requires drive_file_id
      expect(drive!.contracts.download.required_fields).toContain('drive_file_id');
    });
  });

  describe('mcp_server connector', () => {
    it('test 10: exposes invoke_tool generic action', () => {
      const mcp = getConnectorContracts('mcp_server');
      expect(mcp).not.toBeNull();
      expect(mcp!.contracts).toHaveProperty('invoke_tool');
      expect([...mcp!.contracts.invoke_tool.required_fields]).toEqual(['tool_name']);
      expect([...mcp!.contracts.invoke_tool.optional_fields]).toEqual(['tool_args']);
      expect(mcp!.contracts.invoke_tool.description.toLowerCase()).toContain('holded');
    });
  });

  describe('lookup semantics', () => {
    it('test 8: getConnectorContracts("unknown_type") returns null', () => {
      expect(getConnectorContracts('unknown_type')).toBeNull();
      expect(getConnectorContracts('')).toBeNull();
    });

    it('test 11: CONNECTOR_CONTRACTS exports readonly constants + types are usable', () => {
      expect(CONNECTOR_CONTRACTS).toBeDefined();
      expect(typeof CONNECTOR_CONTRACTS).toBe('object');

      // Type-check exports at compile time via assignment
      const c: ConnectorContract | null = getConnectorContracts('gmail');
      expect(c).not.toBeNull();
      if (c) {
        const action: ConnectorAction = c.contracts.send_report;
        expect(action.required_fields).toBeDefined();
      }

      // email_template + smtp + http_api + n8n_webhook stubs exist
      expect(getConnectorContracts('email_template')).not.toBeNull();
      expect(getConnectorContracts('smtp')).not.toBeNull();
      expect(getConnectorContracts('http_api')).not.toBeNull();
      expect(getConnectorContracts('n8n_webhook')).not.toBeNull();
    });
  });
});
