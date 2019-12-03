import { StructureDefinitionExporter } from '../../src/export';
import { FSHTank, FSHDocument } from '../../src/import';
import { FHIRDefinitions, load } from '../../src/fhirdefs';
import { Profile, Extension, FshCode } from '../../src/fshtypes';
import {
  CardRule,
  FlagRule,
  OnlyRule,
  ValueSetRule,
  FixedValueRule
} from '../../src/fshtypes/rules';
import { logger } from '../../src/utils/FSHLogger';

describe('StructureDefinitionExporter', () => {
  let defs: FHIRDefinitions;
  let doc: FSHDocument;
  let input: FSHTank;
  let exporter: StructureDefinitionExporter;
  let mockWriter: jest.SpyInstance<boolean, [any, string, ((error: Error) => void)?]>;

  beforeAll(() => {
    defs = load('4.0.1');
    mockWriter = jest.spyOn(logger.transports[0], 'write');
  });

  beforeEach(() => {
    doc = new FSHDocument('fileName');
    input = new FSHTank([doc], { canonical: 'http://example.com' });
    exporter = new StructureDefinitionExporter(defs, input);
  });

  // Profile
  it('should set all metadata for a profile', () => {
    const profile = new Profile('Foo');
    profile.id = 'foo';
    profile.parent = 'Observation';
    profile.title = 'Foo Profile';
    profile.description = 'foo bar foobar';
    doc.profiles.set(profile.name, profile);
    exporter.exportStructDef(profile);
    const exported = exporter.structDefs[0];
    expect(exported.name).toBe('Foo');
    expect(exported.id).toBe('foo');
    expect(exported.title).toBe('Foo Profile');
    expect(exported.description).toBe('foo bar foobar');
    expect(exported.url).toBe('http://example.com/StructureDefinition/foo');
    expect(exported.type).toBe('Observation');
    expect(exported.baseDefinition).toBe('http://hl7.org/fhir/StructureDefinition/Observation');
    expect(exported.derivation).toBe('constraint');
  });

  it('should not overwrite metadata that is not given for a profile', () => {
    const profile = new Profile('Foo');
    doc.profiles.set(profile.name, profile);
    exporter.exportStructDef(profile);
    const exported = exporter.structDefs[0];
    expect(exported.name).toBe('Foo');
    expect(exported.id).toBe('Foo');
    expect(exported.title).toBeUndefined();
    expect(exported.description).toBe('This is the base resource type for everything.');
    expect(exported.url).toBe('http://example.com/StructureDefinition/Foo');
    expect(exported.type).toBe('Resource');
    expect(exported.baseDefinition).toBe('http://hl7.org/fhir/StructureDefinition/Resource');
    expect(exported.derivation).toBe('constraint');
  });

  it('should throw ParentNotDefinedError when parent resource is not found', () => {
    const profile = new Profile('Foo');
    profile.parent = 'Bar';
    doc.profiles.set(profile.name, profile);
    expect(() => {
      exporter.exportStructDef(profile);
    }).toThrow('Parent Bar not found for Foo');
  });

  // Extension
  it('should set all metadata for an extension', () => {
    const extension = new Extension('Foo');
    extension.id = 'foo';
    extension.title = 'Foo Profile';
    extension.description = 'foo bar foobar';
    doc.extensions.set(extension.name, extension);
    exporter.exportStructDef(extension);
    const exported = exporter.structDefs[0];
    expect(exported.name).toBe('Foo');
    expect(exported.id).toBe('foo');
    expect(exported.title).toBe('Foo Profile');
    expect(exported.description).toBe('foo bar foobar');
    expect(exported.url).toBe('http://example.com/StructureDefinition/foo');
    // NOTE: For now, we always set context to everything, but this will be user-specified in
    // the future
    expect(exported.context).toEqual([
      {
        type: 'element',
        expression: 'Element'
      }
    ]);
    expect(exported.type).toBe('Extension');
    expect(exported.baseDefinition).toBe('http://hl7.org/fhir/StructureDefinition/Extension');
    expect(exported.derivation).toBe('constraint');
  });

  it('should not overwrite metadata that is not given for an extension', () => {
    const extension = new Extension('Foo');
    doc.extensions.set(extension.name, extension);
    exporter.exportStructDef(extension);
    const exported = exporter.structDefs[0];
    expect(exported.name).toBe('Foo');
    expect(exported.id).toBe('Foo');
    expect(exported.title).toBeUndefined();
    expect(exported.description).toBe(
      'Base StructureDefinition for Extension Type: Optional Extension Element - found in all resources.'
    );
    expect(exported.url).toBe('http://example.com/StructureDefinition/Foo');
    // NOTE: For now, we always set context to everything, but this will be user-specified in
    // the future
    expect(exported.context).toEqual([
      {
        type: 'element',
        expression: 'Element'
      }
    ]);
    expect(exported.type).toBe('Extension');
    expect(exported.baseDefinition).toBe('http://hl7.org/fhir/StructureDefinition/Extension');
    expect(exported.derivation).toBe('constraint');
  });

  it('should not hardcode in the default context if parent already had a context', () => {
    // NOTE: This is a temporary test to ensure that we don't overwrite a valid context with our
    // "default" context.  In the (near) future, however, we should do away with our default
    // context and make context user-specified, in which case it should override the parent's
    // context.
    const extension = new Extension('Foo');
    extension.parent = 'http://hl7.org/fhir/StructureDefinition/patient-animal';
    doc.extensions.set(extension.name, extension);
    exporter.exportStructDef(extension);
    const exported = exporter.structDefs[0];
    expect(exported.context).toEqual([
      {
        type: 'element',
        expression: 'Patient'
      }
    ]);
  });

  it('should throw ParentNotDefinedError when parent extension is not found', () => {
    const extension = new Extension('Foo');
    extension.parent = 'Bar';
    doc.extensions.set(extension.name, extension);
    expect(() => {
      exporter.exportStructDef(extension);
    }).toThrow('Parent Bar not found for Foo');
  });

  // Rules
  it('should emit an error and continue when the path is not found', () => {
    const profile = new Profile('Foo');
    const rule = new CardRule('fakePath').withFile('Foo.fsh').withLocation([3, 8, 4, 22]);
    rule.min = 0;
    rule.max = '1';
    profile.rules.push(rule);
    exporter.exportStructDef(profile);
    const structDef = exporter.structDefs[0];
    expect(structDef).toBeDefined();
    expect(structDef.type).toBe('Resource');
    expect(mockWriter.mock.calls[mockWriter.mock.calls.length - 1][0].message).toMatch(
      /File: Foo\.fsh.*Line 3\D.*Column 8\D.*Line 4\D.*Column 22\D/s
    );
  });

  // Card Rule
  it('should apply a correct card rule', () => {
    const profile = new Profile('Foo');
    profile.parent = 'Observation';

    const rule = new CardRule('subject');
    rule.min = 1;
    rule.max = '1';
    profile.rules.push(rule);

    exporter.exportStructDef(profile);
    const sd = exporter.structDefs[0];
    const baseStructDef = sd.getBaseStructureDefinition();

    const baseCard = baseStructDef.findElement('Observation.subject');
    const changedCard = sd.findElement('Observation.subject');

    expect(baseCard.min).toBe(0);
    expect(baseCard.max).toBe('1');
    expect(changedCard.min).toBe(1);
    expect(changedCard.max).toBe('1');
  });

  it('should not apply an incorrect card rule', () => {
    const profile = new Profile('Foo');
    profile.parent = 'Observation';

    const rule = new CardRule('status').withFile('Wrong.fsh').withLocation([5, 4, 5, 11]);
    rule.min = 0;
    rule.max = '1';
    profile.rules.push(rule);

    exporter.exportStructDef(profile);
    const sd = exporter.structDefs[0];
    const baseStructDef = sd.getBaseStructureDefinition();

    const baseCard = baseStructDef.findElement('Observation.status');
    const changedCard = sd.findElement('Observation.status');

    expect(baseCard.min).toBe(1);
    expect(baseCard.max).toBe('1');
    expect(changedCard.min).toBe(1);
    expect(changedCard.max).toBe('1');
    expect(mockWriter.mock.calls[mockWriter.mock.calls.length - 1][0].message).toMatch(
      /File: Wrong\.fsh.*Line 5\D.*Column 4\D.*Line 5\D.*Column 11\D/s
    );
  });

  // Flag Rule
  it('should apply a valid flag rule', () => {
    const profile = new Profile('Foo');
    profile.parent = 'DiagnosticReport';

    const rule = new FlagRule('conclusion');
    rule.modifier = false;
    rule.mustSupport = true;
    profile.rules.push(rule);

    exporter.exportStructDef(profile);
    const sd = exporter.structDefs[0];
    const baseStructDef = sd.getBaseStructureDefinition();

    const baseElement = baseStructDef.findElement('DiagnosticReport.conclusion');
    const changedElement = sd.findElement('DiagnosticReport.conclusion');
    expect(baseElement.isModifier).toBeFalsy();
    expect(baseElement.mustSupport).toBeFalsy();
    expect(baseElement.isSummary).toBeFalsy();
    expect(changedElement.isModifier).toBe(false);
    expect(changedElement.mustSupport).toBe(true);
    expect(baseElement.isSummary).toBeFalsy();
  });

  it('should not apply a flag rule that disables isModifier', () => {
    const profile = new Profile('Foo');
    profile.parent = 'DiagnosticReport';

    const rule = new FlagRule('status').withFile('Nope.fsh').withLocation([8, 7, 8, 15]);
    rule.modifier = false;
    rule.mustSupport = true;
    profile.rules.push(rule);

    exporter.exportStructDef(profile);
    const sd = exporter.structDefs[0];
    const baseStructDef = sd.getBaseStructureDefinition();

    const baseElement = baseStructDef.findElement('DiagnosticReport.status');
    const changedElement = sd.findElement('DiagnosticReport.status');
    expect(baseElement.isModifier).toBe(true);
    expect(baseElement.mustSupport).toBeFalsy();
    expect(changedElement.isModifier).toBe(true);
    expect(changedElement.mustSupport).toBeFalsy();
    expect(mockWriter.mock.calls[mockWriter.mock.calls.length - 1][0].message).toMatch(
      /File: Nope\.fsh.*Line 8\D.*Column 7\D.*Line 8\D.*Column 15\D/s
    );
  });

  it('should not apply a flag rule that disables mustSupport', () => {
    const profile = new Profile('Foo');
    profile.parent = 'http://hl7.org/fhir/StructureDefinition/vitalsigns';

    const rule = new FlagRule('code').withFile('Nope.fsh').withLocation([8, 7, 8, 15]);
    rule.modifier = true;
    rule.summary = false;
    rule.mustSupport = false;
    profile.rules.push(rule);

    exporter.exportStructDef(profile);
    const sd = exporter.structDefs[0];
    const baseStructDef = sd.getBaseStructureDefinition();

    const baseElement = baseStructDef.findElement('Observation.code');
    const changedElement = sd.findElement('Observation.code');
    expect(baseElement.isModifier).toBeFalsy();
    expect(baseElement.isSummary).toBe(true);
    expect(baseElement.mustSupport).toBe(true);
    expect(changedElement.isModifier).toBeFalsy();
    expect(changedElement.isSummary).toBe(true);
    expect(changedElement.mustSupport).toBe(true);
    expect(mockWriter.mock.calls[mockWriter.mock.calls.length - 1][0].message).toMatch(
      /File: Nope\.fsh.*Line 8\D.*Column 7\D.*Line 8\D.*Column 15\D/s
    );
  });

  // Value Set Rule
  it('should apply a correct value set rule to an unbound string', () => {
    const profile = new Profile('Junk');
    profile.parent = 'Appointment';

    const vsRule = new ValueSetRule('description');
    vsRule.valueSet = 'http://example.org/fhir/ValueSet/some-valueset';
    vsRule.strength = 'extensible';
    profile.rules.push(vsRule);

    exporter.exportStructDef(profile);
    const sd = exporter.structDefs[0];
    const baseStructDef = sd.getBaseStructureDefinition();
    const baseElement = baseStructDef.findElement('Appointment.description');
    const changedElement = sd.findElement('Appointment.description');
    expect(baseElement.binding).toBeUndefined();
    expect(changedElement.binding.valueSet).toBe('http://example.org/fhir/ValueSet/some-valueset');
    expect(changedElement.binding.strength).toBe('extensible');
  });

  it('should apply a correct value set rule that overrides a previous binding', () => {
    const profile = new Profile('Foo');
    profile.parent = 'Observation';

    const vsRule = new ValueSetRule('category');
    vsRule.valueSet = 'http://example.org/fhir/ValueSet/some-valueset';
    vsRule.strength = 'extensible';
    profile.rules.push(vsRule);

    exporter.exportStructDef(profile);
    const sd = exporter.structDefs[0];
    const baseStructDef = sd.getBaseStructureDefinition();
    const baseElement = baseStructDef.findElement('Observation.category');
    const changedElement = sd.findElement('Observation.category');
    expect(baseElement.binding.valueSet).toBe('http://hl7.org/fhir/ValueSet/observation-category');
    expect(baseElement.binding.strength).toBe('preferred');
    expect(changedElement.binding.valueSet).toBe('http://example.org/fhir/ValueSet/some-valueset');
    expect(changedElement.binding.strength).toBe('extensible');
  });

  it('should not apply a value set rule on an element that cannot support it', () => {
    const profile = new Profile('Foo');
    profile.parent = 'Observation';

    const vsRule = new ValueSetRule('note').withFile('Codeless.fsh').withLocation([6, 9, 6, 25]);
    vsRule.valueSet = 'http://example.org/fhir/ValueSet/some-valueset';
    vsRule.strength = 'extensible';
    profile.rules.push(vsRule);

    exporter.exportStructDef(profile);
    const sd = exporter.structDefs[0];
    const baseStructDef = sd.getBaseStructureDefinition();
    const baseElement = baseStructDef.findElement('Observation.note');
    const changedElement = sd.findElement('Observation.note');
    expect(baseElement.binding).toBeUndefined();
    expect(changedElement.binding).toBeUndefined();
    expect(mockWriter.mock.calls[mockWriter.mock.calls.length - 1][0].message).toMatch(
      /File: Codeless\.fsh.*Line 6\D.*Column 9\D.*Line 6\D.*Column 25\D/s
    );
  });

  it('should not override a binding with a less strict binding', () => {
    const profile = new Profile('Foo');
    profile.parent = 'Observation';

    const vsRule = new ValueSetRule('category').withFile('Strict.fsh').withLocation([9, 10, 9, 35]);
    vsRule.valueSet = 'http://example.org/fhir/ValueSet/some-valueset';
    vsRule.strength = 'example';
    profile.rules.push(vsRule);

    exporter.exportStructDef(profile);
    const sd = exporter.structDefs[0];
    const baseStructDef = sd.getBaseStructureDefinition();
    const baseElement = baseStructDef.findElement('Observation.category');
    const changedElement = sd.findElement('Observation.category');
    expect(baseElement.binding.valueSet).toBe('http://hl7.org/fhir/ValueSet/observation-category');
    expect(baseElement.binding.strength).toBe('preferred');
    expect(changedElement.binding.valueSet).toBe(
      'http://hl7.org/fhir/ValueSet/observation-category'
    );
    expect(changedElement.binding.strength).toBe('preferred');
    expect(mockWriter.mock.calls[mockWriter.mock.calls.length - 1][0].message).toMatch(
      /File: Strict\.fsh.*Line 9\D.*Column 10\D.*Line 9\D.*Column 35\D/s
    );
  });

  // Only Rule
  it('should apply a correct OnlyRule on a non-reference choice', () => {
    const profile = new Profile('Foo');
    profile.parent = 'Observation';

    const rule = new OnlyRule('value[x]');
    rule.types = [{ type: 'string' }];
    profile.rules.push(rule);

    exporter.exportStructDef(profile);
    const sd = exporter.structDefs[0];
    const baseStructDef = sd.getBaseStructureDefinition();

    const baseValue = baseStructDef.findElement('Observation.value[x]');
    const constrainedValue = sd.findElement('Observation.value[x]');

    expect(baseValue.type).toHaveLength(11);
    expect(baseValue.type[0]).toEqual({ code: 'Quantity' });
    expect(baseValue.type[1]).toEqual({ code: 'CodeableConcept' });
    expect(baseValue.type[2]).toEqual({ code: 'string' });

    expect(constrainedValue.type).toHaveLength(1);
    expect(constrainedValue.type[0]).toEqual({ code: 'string' });
  });

  it('should apply a correct OnlyRule on a reference', () => {
    const profile = new Profile('Foo');
    profile.parent = 'Observation';

    const rule = new OnlyRule('subject');
    rule.types = [{ type: 'Device', isReference: true }];
    profile.rules.push(rule);

    exporter.exportStructDef(profile);
    const sd = exporter.structDefs[0];
    const baseStructDef = sd.getBaseStructureDefinition();

    const baseSubject = baseStructDef.findElement('Observation.subject');
    const constrainedSubject = sd.findElement('Observation.subject');

    expect(baseSubject.type).toHaveLength(1);
    expect(baseSubject.type).toEqual([
      {
        code: 'Reference',
        targetProfile: [
          'http://hl7.org/fhir/StructureDefinition/Patient',
          'http://hl7.org/fhir/StructureDefinition/Group',
          'http://hl7.org/fhir/StructureDefinition/Device',
          'http://hl7.org/fhir/StructureDefinition/Location'
        ]
      }
    ]);

    expect(constrainedSubject.type).toHaveLength(1);
    expect(constrainedSubject.type).toEqual([
      {
        code: 'Reference',
        targetProfile: ['http://hl7.org/fhir/StructureDefinition/Device']
      }
    ]);
  });

  it('should apply a correct OnlyRule with a specific target constrained', () => {
    const profile = new Profile('Foo');
    profile.parent = 'Observation';

    const rule = new OnlyRule('hasMember[Observation]');
    rule.types = [
      { type: 'http://hl7.org/fhir/StructureDefinition/bodyheight', isReference: true },
      { type: 'http://hl7.org/fhir/StructureDefinition/bodyweight', isReference: true }
    ];
    profile.rules.push(rule);

    exporter.exportStructDef(profile);
    const sd = exporter.structDefs[0];
    const baseStructDef = sd.getBaseStructureDefinition();

    const baseHasMember = baseStructDef.findElement('Observation.hasMember');
    const constrainedHasMember = sd.findElement('Observation.hasMember');

    expect(baseHasMember.type).toHaveLength(1);
    expect(baseHasMember.type).toEqual([
      {
        code: 'Reference',
        targetProfile: [
          'http://hl7.org/fhir/StructureDefinition/Observation',
          'http://hl7.org/fhir/StructureDefinition/QuestionnaireResponse',
          'http://hl7.org/fhir/StructureDefinition/MolecularSequence'
        ]
      }
    ]);

    expect(constrainedHasMember.type).toHaveLength(1);
    expect(constrainedHasMember.type).toEqual([
      {
        code: 'Reference',
        targetProfile: [
          'http://hl7.org/fhir/StructureDefinition/bodyheight',
          'http://hl7.org/fhir/StructureDefinition/bodyweight',
          'http://hl7.org/fhir/StructureDefinition/QuestionnaireResponse',
          'http://hl7.org/fhir/StructureDefinition/MolecularSequence'
        ]
      }
    ]);
  });

  it('should not apply an incorrect OnlyRule', () => {
    const profile = new Profile('Foo');
    profile.parent = 'Observation';

    const rule = new OnlyRule('value[x]').withFile('Only.fsh').withLocation([10, 12, 10, 22]);
    rule.types = [{ type: 'instant' }];
    profile.rules.push(rule);

    exporter.exportStructDef(profile);
    const sd = exporter.structDefs[0];
    const baseStructDef = sd.getBaseStructureDefinition();

    const baseValue = baseStructDef.findElement('Observation.value[x]');
    const constrainedValue = sd.findElement('Observation.value[x]');

    expect(baseValue.type).toHaveLength(11);
    expect(constrainedValue.type).toHaveLength(11);
    expect(mockWriter.mock.calls[mockWriter.mock.calls.length - 1][0].message).toMatch(
      /File: Only\.fsh.*Line 10\D.*Column 12\D.*Line 10\D.*Column 22\D/s
    );
  });

  // Fixed Value Rule
  it('should apply a correct FixedValueRule', () => {
    const profile = new Profile('Foo');
    profile.parent = 'Observation';

    const rule = new FixedValueRule('code');
    const fixedFshCode = new FshCode('foo', 'http://foo.com');
    rule.fixedValue = fixedFshCode;
    profile.rules.push(rule);

    exporter.exportStructDef(profile);
    const sd = exporter.structDefs[0];
    const baseStructDef = sd.getBaseStructureDefinition();

    const baseCode = baseStructDef.findElement('Observation.code');
    const fixedCode = sd.findElement('Observation.code');

    expect(baseCode.patternCodeableConcept).toBeUndefined();
    expect(fixedCode.patternCodeableConcept).toEqual({
      coding: [{ code: 'foo', system: 'http://foo.com' }]
    });
  });

  it('should not apply an incorrect FixedValueRule', () => {
    const profile = new Profile('Foo');
    profile.parent = 'Observation';

    const rule = new FixedValueRule('code').withFile('Fixed.fsh').withLocation([4, 18, 4, 28]);
    rule.fixedValue = true; // Incorrect boolean
    profile.rules.push(rule);

    exporter.exportStructDef(profile);
    const sd = exporter.structDefs[0];
    const baseStructDef = sd.getBaseStructureDefinition();

    const baseCode = baseStructDef.findElement('Observation.code');
    const fixedCode = sd.findElement('Observation.code');

    expect(baseCode.patternCodeableConcept).toBeUndefined();
    expect(fixedCode.patternCodeableConcept).toBeUndefined(); // Code remains unset
    expect(mockWriter.mock.calls[mockWriter.mock.calls.length - 1][0].message).toMatch(
      /File: Fixed\.fsh.*Line 4\D.*Column 18\D.*Line 4\D.*Column 28\D/s
    );
  });

  // toJSON
  it('should correctly generate a diff containing only changed elements', () => {
    // We already have separate tests for the differentials, so this just ensures that the
    // StructureDefinition is setup correctly to produce accurate differential elements.
    const profile = new Profile('Foo');
    profile.parent = 'Observation';

    const rule = new CardRule('subject');
    rule.min = 1;
    rule.max = '1';
    profile.rules.push(rule);

    exporter.exportStructDef(profile);
    const sd = exporter.structDefs[0];
    const json = sd.toJSON();

    expect(json.differential.element).toHaveLength(1);
    expect(json.differential.element[0]).toEqual({
      id: 'Observation.subject',
      path: 'Observation.subject',
      min: 1
    });
  });
});