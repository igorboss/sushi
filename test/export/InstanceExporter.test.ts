import { InstanceExporter, Package, StructureDefinitionExporter } from '../../src/export';
import { FSHTank, FSHDocument } from '../../src/import';
import { FHIRDefinitions, loadFromPath } from '../../src/fhirdefs';
import {
  Instance,
  Profile,
  FshCanonical,
  FshCode,
  FshReference,
  Extension,
  FshCodeSystem,
  RuleSet,
  FshQuantity
} from '../../src/fshtypes';
import {
  AssignmentRule,
  ContainsRule,
  CardRule,
  OnlyRule,
  CaretValueRule,
  InsertRule
} from '../../src/fshtypes/rules';
import { loggerSpy, TestFisher } from '../testhelpers';
import { InstanceDefinition } from '../../src/fhirtypes';
import path from 'path';
import { minimalConfig } from '../utils/minimalConfig';

describe('InstanceExporter', () => {
  let defs: FHIRDefinitions;
  let doc: FSHDocument;
  let sdExporter: StructureDefinitionExporter;
  let exporter: InstanceExporter;
  let exportInstance: (instance: Instance) => InstanceDefinition;

  beforeAll(() => {
    defs = new FHIRDefinitions();
    loadFromPath(
      path.join(__dirname, '..', 'testhelpers', 'testdefs', 'package'),
      'testPackage',
      defs
    );
  });

  beforeEach(() => {
    doc = new FSHDocument('fileName');
    const input = new FSHTank([doc], minimalConfig);
    const pkg = new Package(input.config);
    const fisher = new TestFisher(input, defs, pkg);
    sdExporter = new StructureDefinitionExporter(input, pkg, fisher);
    exporter = new InstanceExporter(input, pkg, fisher);
    exportInstance = (instance: Instance) => {
      sdExporter.export();
      return exporter.exportInstance(instance);
    };
  });

  it('should output empty results with empty input', () => {
    const exported = exporter.export().instances;
    expect(exported).toEqual([]);
  });

  it('should export a single instance', () => {
    const instance = new Instance('MyInstance');
    instance.instanceOf = 'Patient';
    doc.instances.set(instance.name, instance);
    const exported = exporter.export().instances;
    expect(exported.length).toBe(1);
  });

  it('should export multiple instances', () => {
    const instanceFoo = new Instance('Foo');
    instanceFoo.instanceOf = 'Patient';
    const instanceBar = new Instance('Bar');
    instanceBar.instanceOf = 'Patient';
    doc.instances.set(instanceFoo.name, instanceFoo);
    doc.instances.set(instanceBar.name, instanceBar);
    const exported = exporter.export().instances;
    expect(exported.length).toBe(2);
  });

  it('should still export instance if one fails', () => {
    const instanceFoo = new Instance('Foo');
    instanceFoo.instanceOf = 'Baz';
    const instanceBar = new Instance('Bar');
    instanceBar.instanceOf = 'Patient';
    doc.instances.set(instanceFoo.name, instanceFoo);
    doc.instances.set(instanceBar.name, instanceBar);
    const exported = exporter.export().instances;
    expect(exported.length).toBe(1);
    expect(exported[0]._instanceMeta.name).toBe('Bar');
  });

  it('should log a message with source information when the parent is not found', () => {
    const instance = new Instance('Bogus').withFile('Bogus.fsh').withLocation([2, 9, 4, 23]);
    instance.instanceOf = 'BogusParent';
    doc.instances.set(instance.name, instance);
    exporter.export();
    expect(loggerSpy.getLastMessage('error')).toMatch(/File: Bogus\.fsh.*Line: 2 - 4\D*/s);
  });

  it('should export instances with InstanceOf FSHy profile', () => {
    const profileFoo = new Profile('Foo');
    profileFoo.parent = 'Patient';
    const instanceBar = new Instance('Bar');
    instanceBar.instanceOf = 'Foo';
    doc.profiles.set(profileFoo.name, profileFoo);
    doc.instances.set(instanceBar.name, instanceBar);
    sdExporter.export();
    const exported = exporter.export().instances;
    expect(exported.length).toBe(1); // One instance is successfully exported because profile is defined
    expect(exported[0]._instanceMeta.name).toBe('Bar');
    expect(exported[0].resourceType).toBe('Patient');
  });

  it('should assign values on an instance', () => {
    const instance = new Instance('Bar');
    instance.instanceOf = 'Patient';
    const assignedValRule = new AssignmentRule('gender');
    const assignedFshCode = new FshCode('foo', 'http://foo.com');
    assignedValRule.value = assignedFshCode;
    instance.rules.push(assignedValRule);
    doc.instances.set(instance.name, instance);
    const exported = exporter.export().instances;
    expect(exported.length).toBe(1);
    expect(exported[0].gender).toBe('foo');
  });

  describe('#exportInstance', () => {
    let patient: Profile;
    let respRate: Profile;
    let patientProf: Profile;
    let bundle: Profile;
    let patientInstance: Instance;
    let patientProfInstance: Instance;
    let lipidInstance: Instance;
    let valueSetInstance: Instance;
    let respRateInstance: Instance;
    let bundleInstance: Instance;
    beforeEach(() => {
      loggerSpy.reset();
      patient = new Profile('TestPatient');
      patient.parent = 'Patient';
      doc.profiles.set(patient.name, patient);
      patientProf = new Profile('TestPatientProf');
      patientProf.parent = 'patient-proficiency';
      doc.profiles.set(patientProf.name, patientProf);
      respRate = new Profile('TestRespRate');
      respRate.parent = 'resprate';
      doc.profiles.set(respRate.name, respRate);
      bundle = new Profile('TestBundle');
      bundle.parent = 'Bundle';
      doc.profiles.set(bundle.name, bundle);
      patientInstance = new Instance('Bar')
        .withFile('PatientInstance.fsh')
        .withLocation([10, 1, 20, 30]);
      patientInstance.instanceOf = 'TestPatient';
      doc.instances.set(patientInstance.name, patientInstance);
      patientProfInstance = new Instance('Baz');
      patientProfInstance.instanceOf = 'TestPatientProf';
      doc.instances.set(patientProfInstance.name, patientProfInstance);
      lipidInstance = new Instance('Bam')
        .withFile('LipidInstance.fsh')
        .withLocation([10, 1, 20, 30]);
      lipidInstance.instanceOf = 'lipidprofile';
      doc.instances.set(lipidInstance.name, lipidInstance);
      valueSetInstance = new Instance('Boom');
      valueSetInstance.instanceOf = 'ValueSet';
      doc.instances.set(valueSetInstance.name, valueSetInstance);
      respRateInstance = new Instance('Bang');
      respRateInstance.instanceOf = 'TestRespRate';
      doc.instances.set(respRateInstance.name, respRateInstance);
      bundleInstance = new Instance('Pow');
      bundleInstance.instanceOf = 'TestBundle';
      doc.instances.set(bundleInstance.name, bundleInstance);
    });

    // Setting Metadata
    it('should set meta.profile to the defining URL we are making an instance of', () => {
      const exported = exportInstance(patientInstance);
      expect(exported.meta).toEqual({
        profile: ['http://hl7.org/fhir/us/minimal/StructureDefinition/TestPatient']
      });
    });

    it('should not set meta.profile when we are making an instance of a base resource', () => {
      const boo = new Instance('Boo');
      boo.instanceOf = 'Patient';
      const exported = exportInstance(boo);
      expect(exported.meta).toBeUndefined();
    });

    // Setting instance id
    it('should set id to instance name by default', () => {
      const myExamplePatient = new Instance('MyExample');
      myExamplePatient.instanceOf = 'Patient';
      const exported = exportInstance(myExamplePatient);
      const expectedInstanceJSON = {
        resourceType: 'Patient',
        id: 'MyExample'
      };
      expect(exported.toJSON()).toEqual(expectedInstanceJSON);
    });

    it('should overwrite id if it is set by a rule', () => {
      const myExamplePatient = new Instance('MyExample');
      myExamplePatient.instanceOf = 'Patient';
      const assignedValRule = new AssignmentRule('id');
      assignedValRule.value = 'PatientA';
      myExamplePatient.rules.push(assignedValRule);
      const exported = exportInstance(myExamplePatient);
      const expectedInstanceJSON = {
        resourceType: 'Patient',
        id: 'PatientA'
      };
      expect(exported.toJSON()).toEqual(expectedInstanceJSON);
    });

    it('should log a message when the instance has an invalid id', () => {
      const myExamplePatient = new Instance('MyExample')
        .withFile('Some.fsh')
        .withLocation([3, 6, 6, 45]);
      myExamplePatient.instanceOf = 'Patient';
      const assignedValRule = new AssignmentRule('id');
      assignedValRule.value = 'Some Patient';
      myExamplePatient.rules.push(assignedValRule);
      const exported = exportInstance(myExamplePatient);
      const expectedInstanceJSON = {
        resourceType: 'Patient',
        id: 'Some Patient'
      };
      expect(exported.toJSON()).toEqual(expectedInstanceJSON);
      expect(loggerSpy.getLastMessage()).toMatch(/does not represent a valid FHIR id/s);
      expect(loggerSpy.getLastMessage()).toMatch(/File: Some\.fsh.*Line: 3 - 6\D*/s);
    });

    it('should sanitize the id and log a message when a valid name is used to make an invalid id', () => {
      const instance = new Instance('Foo').withFile('Wrong.fsh').withLocation([2, 8, 5, 18]);
      instance.instanceOf = 'Patient';
      const assignedValRule = new AssignmentRule('id');
      assignedValRule.value = 'Some_Patient';
      instance.rules.push(assignedValRule);
      const exported = exportInstance(instance);
      const expectedInstanceJSON = {
        resourceType: 'Patient',
        id: 'Some-Patient'
      };
      expect(exported.toJSON()).toEqual(expectedInstanceJSON);
      expect(loggerSpy.getLastMessage('warn')).toMatch(
        /The string "Some_Patient" represents a valid FHIR name but not a valid FHIR id.*The id will be exported as "Some-Patient"/s
      );
      expect(loggerSpy.getLastMessage('warn')).toMatch(/File: Wrong\.fsh.*Line: 2 - 5\D*/s);
    });

    it('should sanitize the id and log a message when a long valid name is used to make an invalid id', () => {
      const instance = new Instance('Foo').withFile('Wrong.fsh').withLocation([2, 8, 5, 18]);
      instance.instanceOf = 'Patient';
      const assignedValRule = new AssignmentRule('id');
      let longId = 'Toolong';
      while (longId.length < 65) longId += 'longer';
      assignedValRule.value = longId;
      instance.rules.push(assignedValRule);
      const exported = exportInstance(instance);
      const expectedId = longId.slice(0, 64);
      const expectedInstanceJSON = {
        resourceType: 'Patient',
        id: expectedId
      };
      expect(exported.toJSON()).toEqual(expectedInstanceJSON);
      const warning = new RegExp(
        `The string "${longId}" represents a valid FHIR name but not a valid FHIR id.*The id will be exported as "${expectedId}"`,
        's'
      );
      expect(loggerSpy.getLastMessage('warn')).toMatch(warning);
      expect(loggerSpy.getLastMessage('warn')).toMatch(/File: Wrong\.fsh.*Line: 2 - 5\D*/s);
    });
    it('should log an error when multiple instances of the same type have the same id', () => {
      const firstExample = new Instance('FirstExample')
        .withFile('Repeat.fsh')
        .withLocation([3, 8, 11, 25]);
      firstExample.instanceOf = 'Patient';
      const firstId = new AssignmentRule('id');
      firstId.value = 'repeated-id';
      firstExample.rules.push(firstId);
      doc.instances.set(firstExample.name, firstExample);

      const secondExample = new Instance('SecondExample')
        .withFile('Repeat.fsh')
        .withLocation([13, 8, 20, 22]);
      secondExample.instanceOf = 'Patient';
      const secondId = new AssignmentRule('id');
      secondId.value = 'repeated-id';
      secondExample.rules.push(secondId);
      doc.instances.set(secondExample.name, secondExample);

      exporter.exportInstance(firstExample);
      exporter.exportInstance(secondExample);
      expect(loggerSpy.getLastMessage('error')).toMatch(
        /Multiple instances of type Patient with id repeated-id/s
      );
      expect(loggerSpy.getLastMessage('error')).toMatch(/File: Repeat\.fsh.*Line: 13 - 20\D*/s);
    });

    it('should not log an error when multiple instances of different types have the same id', () => {
      const firstExample = new Instance('FirstExample')
        .withFile('Repeat.fsh')
        .withLocation([3, 8, 11, 25]);
      firstExample.instanceOf = 'Patient';
      const firstId = new AssignmentRule('id');
      firstId.value = 'repeated-id';
      firstExample.rules.push(firstId);
      doc.instances.set(firstExample.name, firstExample);

      const secondExample = new Instance('SecondExample')
        .withFile('Repeat.fsh')
        .withLocation([13, 8, 20, 22]);
      secondExample.instanceOf = 'Practitioner';
      const secondId = new AssignmentRule('id');
      secondId.value = 'repeated-id';
      secondExample.rules.push(secondId);
      doc.instances.set(secondExample.name, secondExample);

      exporter.exportInstance(firstExample);
      exporter.exportInstance(secondExample);
      expect(loggerSpy.getAllMessages('error')).toHaveLength(0);
    });

    it('should not log an error when multiple inline instances of the same type have the same id', () => {
      // Inline instances will typically not have an id assigned to them
      const firstQuantity = new Instance('FirstQuantity');
      firstQuantity.instanceOf = 'Quantity';
      firstQuantity.usage = 'Inline';
      doc.instances.set(firstQuantity.name, firstQuantity);

      const secondQuantity = new Instance('SecondQuantity');
      secondQuantity.instanceOf = 'Quantity';
      secondQuantity.usage = 'Inline';
      doc.instances.set(secondQuantity.name, secondQuantity);

      const firstInstance = exporter.exportInstance(firstQuantity);
      const secondInstance = exporter.exportInstance(secondQuantity);
      expect(firstInstance.id).toBe(secondInstance.id);
      expect(loggerSpy.getAllMessages('error')).toHaveLength(0);
    });

    it('should not log an error when an inline instance and a non-inline instance of the same type have the same id', () => {
      const inlineQuantity = new Instance('FirstQuantity');
      inlineQuantity.instanceOf = 'Quantity';
      inlineQuantity.usage = 'Inline';
      const inlineId = new AssignmentRule('id');
      inlineId.value = 'my-quantity';
      inlineQuantity.rules.push(inlineId);
      doc.instances.set(inlineQuantity.name, inlineQuantity);

      const exampleQuantity = new Instance('SecondQuantity');
      exampleQuantity.instanceOf = 'Quantity';
      exampleQuantity.usage = 'Example';
      const exampleId = new AssignmentRule('id');
      exampleId.value = 'my-quantity';
      exampleQuantity.rules.push(exampleId);
      doc.instances.set(exampleQuantity.name, exampleQuantity);

      const inlineInstance = exporter.exportInstance(inlineQuantity);
      const exampleInstance = exporter.exportInstance(exampleQuantity);
      expect(inlineInstance.id).toBe(exampleInstance.id);
      expect(loggerSpy.getAllMessages('error')).toHaveLength(0);
    });

    // Assigning top level elements
    it('should assign top level elements that are assigned by pattern[x] on the Structure Definition', () => {
      const cardRule = new CardRule('active');
      cardRule.min = 1;
      patient.rules.push(cardRule);
      const assignedValRule = new AssignmentRule('active');
      assignedValRule.value = true;
      patient.rules.push(assignedValRule);
      const exported = exportInstance(patientInstance);
      expect(exported.active).toEqual(true);
    });

    it('should assign top level elements that are assigned by fixed[x] on the Structure Definition', () => {
      const cardRule = new CardRule('active');
      cardRule.min = 1;
      patient.rules.push(cardRule);
      const assignedValRule = new AssignmentRule('active');
      assignedValRule.value = true;
      assignedValRule.exactly = true;
      patient.rules.push(assignedValRule);
      const exported = exportInstance(patientInstance);
      expect(exported.active).toEqual(true);
    });

    it('should assign top level codes that are assigned on the Structure Definition', () => {
      const cardRule = new CardRule('gender');
      cardRule.min = 1;
      patient.rules.push(cardRule);
      const assignedValRule = new AssignmentRule('gender');
      assignedValRule.value = new FshCode('F');
      patient.rules.push(assignedValRule);
      const exported = exportInstance(patientInstance);
      expect(exported.gender).toBe('F');
    });

    it('should not assign optional elements that are assigned on the Structure Definition', () => {
      const assignedValRule = new AssignmentRule('active');
      assignedValRule.value = true;
      patient.rules.push(assignedValRule);
      const exported = exportInstance(patientInstance);
      expect(exported.active).toBeUndefined();
    });

    it('should assign top level elements to an array even if constrained on the Structure Definition', () => {
      const condition = new Profile('TestCondition');
      condition.parent = 'Condition';
      const cardRule = new CardRule('category');
      cardRule.min = 1;
      cardRule.max = '1';
      condition.rules.push(cardRule);
      doc.profiles.set(condition.name, condition);
      const conditionInstance = new Instance('Bar');
      conditionInstance.instanceOf = 'TestCondition';
      doc.instances.set(conditionInstance.name, conditionInstance);
      const assignedValRule = new AssignmentRule('category');
      const assignedFshCode = new FshCode('foo', 'http://foo.com');
      assignedValRule.value = assignedFshCode;
      condition.rules.push(assignedValRule);
      const exported = exportInstance(conditionInstance);
      expect(exported.category).toEqual([
        {
          coding: [
            {
              code: 'foo',
              system: 'http://foo.com'
            }
          ]
        }
      ]);
    });

    it('should assign top level elements that are assigned by a pattern on the Structure Definition', () => {
      const cardRule = new CardRule('maritalStatus');
      cardRule.min = 1;
      patient.rules.push(cardRule);
      const assignedValRule = new AssignmentRule('maritalStatus');
      const assignedFshCode = new FshCode('foo', 'http://foo.com');
      assignedValRule.value = assignedFshCode;
      patient.rules.push(assignedValRule);
      const exported = exportInstance(patientInstance);
      expect(exported.maritalStatus).toEqual({
        coding: [{ code: 'foo', system: 'http://foo.com' }]
      });
    });

    it('should assign a value onto an element that are assigned by a pattern on the Structure Definition', () => {
      const observation = new Profile('TestObservation');
      observation.parent = 'Observation';
      doc.profiles.set(observation.name, observation);
      const onlyRule = new OnlyRule('value[x]');
      onlyRule.types = [{ type: 'Quantity' }];
      observation.rules.push(onlyRule); // * value[x] only Quantity
      const assignedValRule = new AssignmentRule('valueQuantity');
      const assignedFshCode = new FshCode('foo', 'http://foo.com');
      assignedValRule.value = assignedFshCode;
      observation.rules.push(assignedValRule); // * valueQuantity = foo.com#foo
      const cardRule = new CardRule('valueQuantity');
      cardRule.min = 1;
      observation.rules.push(cardRule); // * valueQuantity 1..1
      const observationInstance = new Instance('MyObservation');
      observationInstance.instanceOf = 'TestObservation';
      const assignedQuantityValue = new AssignmentRule('valueQuantity.value');
      assignedQuantityValue.value = 100;
      observationInstance.rules.push(assignedQuantityValue); // * valueQuantity.value = 100
      doc.instances.set(observationInstance.name, observationInstance);

      const exported = exportInstance(observationInstance);
      expect(exported.valueQuantity).toEqual({
        code: 'foo',
        system: 'http://foo.com',
        value: 100
      });
    });

    it('should assign a value onto slice elements that are assigned by a pattern on the Structure Definition', () => {
      const containsRule = new ContainsRule('category');
      containsRule.items = [{ name: 'niceSlice' }];
      respRate.rules.push(containsRule); // * category contains niceSlice
      const cardRule = new CardRule('category[niceSlice]');
      cardRule.min = 1;
      cardRule.max = '*';
      respRate.rules.push(cardRule); // * category[niceSlice] 1..*
      const assignedValRule = new AssignmentRule('category[niceSlice]');
      const assignedFshCode = new FshCode('rice', 'http://spice.com');
      assignedValRule.value = assignedFshCode;
      respRate.rules.push(assignedValRule); // * category[niceSlice] = http://spice.com#rice
      const exported = exportInstance(respRateInstance);
      expect(exported.category).toContainEqual({
        coding: [
          {
            code: 'rice',
            system: 'http://spice.com'
          }
        ]
      });
    });

    it('should assign top level choice elements that are assigned on the Structure Definition', () => {
      const assignedValRule = new AssignmentRule('deceasedBoolean');
      assignedValRule.value = true;
      patient.rules.push(assignedValRule);
      const cardRule = new CardRule('deceasedBoolean');
      cardRule.min = 1;
      patient.rules.push(cardRule);
      const exported = exportInstance(patientInstance);
      expect(exported.deceasedBoolean).toBe(true);
    });

    it('should assign an element to a value the same as the assigned value on the Structure Definition', () => {
      const assignedValRule = new AssignmentRule('active');
      assignedValRule.value = true;
      assignedValRule.exactly = true;
      patient.rules.push(assignedValRule);
      const instanceAssignedValRule = new AssignmentRule('active');
      instanceAssignedValRule.value = true;
      patientInstance.rules.push(instanceAssignedValRule);
      const exported = exportInstance(patientInstance);
      expect(exported.active).toEqual(true);
      expect(loggerSpy.getAllMessages('error')).toHaveLength(0);
    });

    it('should assign an element to a value the same as the assigned pattern on the Structure Definition', () => {
      const assignedValRule = new AssignmentRule('maritalStatus');
      const assignedFshCode = new FshCode('foo', 'http://foo.com');
      assignedValRule.value = assignedFshCode;
      patient.rules.push(assignedValRule);
      const instanceAssignedValRule = new AssignmentRule('maritalStatus');
      const instanceAssignedFshCode = new FshCode('foo', 'http://foo.com');
      instanceAssignedValRule.value = instanceAssignedFshCode;
      patientInstance.rules.push(instanceAssignedValRule);
      const exported = exportInstance(patientInstance);
      expect(exported.maritalStatus).toEqual({
        coding: [{ code: 'foo', system: 'http://foo.com' }]
      });
      expect(loggerSpy.getAllMessages('error')).toHaveLength(0);
    });

    it('should assign an element to a value that is a superset of the assigned pattern on the Structure Definition', () => {
      const assignedValRule = new AssignmentRule('maritalStatus');
      const assignedFshCode = new FshCode('foo', 'http://foo.com');
      assignedValRule.value = assignedFshCode;
      patient.rules.push(assignedValRule);
      const instanceAssignedValRule = new AssignmentRule('maritalStatus');
      const instanceAssignedFshCode = new FshCode('foo', 'http://foo.com', 'Foo Foo');
      instanceAssignedValRule.value = instanceAssignedFshCode;
      patientInstance.rules.push(instanceAssignedValRule);
      const exported = exportInstance(patientInstance);
      expect(exported.maritalStatus).toEqual({
        coding: [{ code: 'foo', system: 'http://foo.com', display: 'Foo Foo' }]
      });
    });

    it('should not assign an element to a value different than the assigned value on the Structure Definition', () => {
      const assignedValRule = new AssignmentRule('active');
      assignedValRule.value = true;
      patient.rules.push(assignedValRule);
      const cardRule = new CardRule('active');
      cardRule.min = 1;
      patient.rules.push(cardRule);
      const instanceAssignedValRule = new AssignmentRule('active');
      instanceAssignedValRule.value = false;
      patientInstance.rules.push(instanceAssignedValRule);
      const exported = exportInstance(patientInstance);
      expect(exported.active).toBe(true);
      expect(loggerSpy.getLastMessage()).toMatch(
        'Cannot assign false to this element; a different boolean is already assigned: true'
      );
    });

    it('should not assign an element to a value different than the pattern value on the Structure Definition', () => {
      const assignedValRule = new AssignmentRule('maritalStatus');
      const assignedFshCode = new FshCode('foo', 'http://foo.com');
      assignedValRule.value = assignedFshCode;
      patient.rules.push(assignedValRule);
      const cardRule = new CardRule('maritalStatus');
      cardRule.min = 1;
      patient.rules.push(cardRule);
      const instanceAssignedValRule = new AssignmentRule('maritalStatus');
      const instanceAssignedFshCode = new FshCode('bar', 'http://bar.com');
      instanceAssignedValRule.value = instanceAssignedFshCode;
      patientInstance.rules.push(instanceAssignedValRule);
      const exported = exportInstance(patientInstance);
      expect(exported.maritalStatus.coding[0]).toEqual({
        code: 'foo',
        system: 'http://foo.com'
      });
      expect(loggerSpy.getLastMessage()).toMatch(
        'Cannot assign http://bar.com#bar to this element; a different CodeableConcept is already assigned: {"coding":[{"code":"foo","system":"http://foo.com"}]}.'
      );
    });

    // Nested elements
    it('should assign a nested element that has parents defined in the instance and is assigned on the Structure Definition', () => {
      const cardRule = new CardRule('communication.preferred');
      cardRule.min = 1;
      patient.rules.push(cardRule);
      const assignedValRule = new AssignmentRule('communication.preferred');
      assignedValRule.value = true;
      patient.rules.push(assignedValRule);
      const instanceAssignedValRule = new AssignmentRule('communication[0].language');
      instanceAssignedValRule.value = new FshCode('foo');
      patientInstance.rules.push(instanceAssignedValRule);
      const exported = exportInstance(patientInstance);
      expect(exported.communication[0]).toEqual({
        preferred: true,
        language: { coding: [{ code: 'foo' }] }
      });
    });

    it('should assign a nested element that has parents and children defined in the instance and is assigned on the Structure Definition', () => {
      const cardRule = new CardRule('communication.language.text');
      cardRule.min = 1;
      patient.rules.push(cardRule);
      const assignedValRule = new AssignmentRule('communication.language.text');
      assignedValRule.value = 'foo';
      patient.rules.push(assignedValRule);
      const instanceAssignedValRule = new AssignmentRule(
        'communication[0].language.coding[0].version'
      );
      instanceAssignedValRule.value = 'bar';
      patientInstance.rules.push(instanceAssignedValRule);
      const exported = exportInstance(patientInstance);
      expect(exported.communication[0]).toEqual({
        language: { text: 'foo', coding: [{ version: 'bar' }] }
      });
    });

    it('should not assign a nested element that does not have parents defined in the instance', () => {
      const assignedValRule = new AssignmentRule('communication.preferred');
      assignedValRule.value = true;
      patient.rules.push(assignedValRule);
      const exported = exportInstance(patientInstance);
      expect(exported.communication).toBeUndefined();
    });

    it('should assign a nested element that has parents defined in the instance and assigned on the SD to an array even if constrained', () => {
      const cardRule = new CardRule('contact');
      cardRule.min = 1;
      cardRule.max = '1';
      patient.rules.push(cardRule);
      const cardRuleRelationship = new CardRule('contact.relationship');
      cardRuleRelationship.min = 1;
      cardRuleRelationship.max = '*';
      patient.rules.push(cardRuleRelationship);
      const assignedValRule = new AssignmentRule('contact.relationship');
      assignedValRule.value = new FshCode('mother');
      patient.rules.push(assignedValRule);
      const instanceAssignedValRule = new AssignmentRule('contact.gender');
      instanceAssignedValRule.value = new FshCode('foo');
      patientInstance.rules.push(instanceAssignedValRule);
      const exported = exportInstance(patientInstance);
      expect(exported.contact).toEqual([
        {
          gender: 'foo',
          relationship: [{ coding: [{ code: 'mother' }] }]
        }
      ]);
    });

    // Deeply Nested Elements
    it('should assign a deeply nested element that is assigned on the Structure Definition and has 1..1 parents', () => {
      // * telecom.period 1..1
      // * telecom.period.start 1..1
      // * telecom.period.start = "2000-07-04"
      const periodCard = new CardRule('telecom.period');
      periodCard.min = 1;
      periodCard.max = '1';
      const startCard = new CardRule('telecom.period.start');
      startCard.min = 1;
      startCard.max = '1';
      const assignedValRule = new AssignmentRule('telecom.period.start');
      assignedValRule.value = '2000-07-04';

      patient.rules.push(periodCard, startCard, assignedValRule);
      const instanceAssignedValRule = new AssignmentRule('telecom[0].system');
      instanceAssignedValRule.value = new FshCode('email');
      patientInstance.rules.push(instanceAssignedValRule); // * telecom[0].system = #email
      const exported = exportInstance(patientInstance);
      expect(exported.telecom[0]).toEqual({
        system: 'email',
        period: {
          start: '2000-07-04'
        }
      });
    });

    it('should not get confused by matching path parts when assigning deeply nested elements', () => {
      // * maritalStatus, maritalStatus.coding, maritalStatus.coding.system 1..1
      // * maritalStatus.coding.system = "http://itscomplicated.com"
      const statCard = new CardRule('maritalStatus');
      statCard.min = 1;
      statCard.max = '1';
      const codingCard = new CardRule('maritalStatus.coding');
      codingCard.min = 1;
      codingCard.max = '1';
      const sysCard = new CardRule('maritalStatus.coding.system');
      sysCard.min = 1;
      sysCard.max = '1';
      const assignedValRule = new AssignmentRule('maritalStatus.coding.system');
      assignedValRule.value = 'http://itscomplicated.com';

      patient.rules.push(statCard, codingCard, sysCard, assignedValRule);
      const instanceAssignedValRule = new AssignmentRule('generalPractitioner.identifier.system');
      instanceAssignedValRule.value = 'http://medicine.med';
      patientInstance.rules.push(instanceAssignedValRule); // * generalPractitioner.identifier.system = "http://medicine.med"
      const exported = exportInstance(patientInstance);
      expect(exported.maritalStatus).toEqual({ coding: [{ system: 'http://itscomplicated.com' }] });
      expect(exported.generalPractitioner).toEqual([
        { identifier: { system: 'http://medicine.med' } }
      ]);
      const messages = loggerSpy.getAllMessages('error');
      expect(messages).toHaveLength(0);
    });

    it('should assign a deeply nested element that is assigned on the Structure Definition and has array parents with min > 1', () => {
      // * identifier 2..*
      // * identifier.type.coding 2..*
      // * identifier.type.coding.display 1..1
      // * identifier.type.coding.display = "This is my coding"
      const idCard = new CardRule('identifier');
      idCard.min = 2;
      idCard.max = '*';
      const typeCard = new CardRule('identifier.type.coding');
      typeCard.min = 2;
      typeCard.max = '*';
      const displayCard = new CardRule('identifier.type.coding.display');
      displayCard.min = 1;
      displayCard.max = '1';
      const assignedValRule = new AssignmentRule('identifier.type.coding.display');
      assignedValRule.value = 'This is my coding';

      patient.rules.push(idCard, typeCard, displayCard, assignedValRule);
      const instanceAssignedValRule = new AssignmentRule('identifier.type.coding[2].version');
      instanceAssignedValRule.value = '1.2.3';
      patientInstance.rules.push(instanceAssignedValRule); // * identifier.type.coding[2].version = "1.2.3"
      const exported = exportInstance(patientInstance);
      expect(exported.identifier).toEqual([
        {
          type: {
            coding: [
              {
                display: 'This is my coding'
              },
              {
                display: 'This is my coding'
              },
              {
                display: 'This is my coding',
                version: '1.2.3'
              }
            ]
          }
        }
      ]);
    });

    it('should assign a deeply nested element that is assigned on the Structure Definition and has slice array parents with min > 1', () => {
      // * category contains niceSlice
      // * category[niceSlice] 1..1
      // * category[niceSlice] = http://spice.com#rice
      const containsRule = new ContainsRule('category');
      containsRule.items = [{ name: 'niceSlice' }];
      respRate.rules.push(containsRule);
      const cardRule = new CardRule('category[niceSlice]');
      cardRule.min = 1;
      cardRule.max = '1';
      respRate.rules.push(cardRule);
      const assignedValRule = new AssignmentRule('category[niceSlice]');
      const assignedFshCode = new FshCode('rice', 'http://spice.com');
      assignedValRule.value = assignedFshCode;
      respRate.rules.push(containsRule, cardRule, assignedValRule);
      const exported = exportInstance(respRateInstance);
      expect(exported.category).toEqual([
        {
          coding: [
            {
              code: 'rice',
              system: 'http://spice.com'
            }
          ]
        },
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'vital-signs'
            }
          ]
        }
      ]);
    });

    it('should not assign a deeply nested element that is assigned on the Structure Definition but does not have 1..1 parents', () => {
      // * telecom.period 0..1 // Element is optional
      // * telecom.period.start 1..1
      // * telecom.period.start = "2000-07-04"
      const periodCard = new CardRule('telecom.period');
      periodCard.min = 0;
      periodCard.max = '1';
      const startCard = new CardRule('telecom.period.start');
      startCard.min = 1;
      startCard.max = '1';
      const assignedValRule = new AssignmentRule('telecom.period.start');
      assignedValRule.value = '2000-07-04';

      patient.rules.push(periodCard, startCard, assignedValRule);
      const instanceAssignedValRule = new AssignmentRule('telecom[0].system');
      instanceAssignedValRule.value = new FshCode('email');
      patientInstance.rules.push(instanceAssignedValRule); // * telecom[0].system = #email
      const exported = exportInstance(patientInstance);
      expect(exported.telecom[0]).toEqual({
        system: 'email'
        // period not included since it is 0..1
      });
    });

    // Assigning with pattern[x]
    it('should assign a nested element that is assigned by pattern[x] from a parent on the SD', () => {
      const assignedValRule = new AssignmentRule('maritalStatus.coding');
      assignedValRule.value = new FshCode('foo', 'http://foo.com');
      patient.rules.push(assignedValRule);
      const instanceAssignedValRule = new AssignmentRule('maritalStatus.coding[0].version');
      instanceAssignedValRule.value = '1.2.3';
      patientInstance.rules.push(instanceAssignedValRule);
      const exported = exportInstance(patientInstance);
      expect(exported.maritalStatus).toEqual({
        coding: [
          {
            code: 'foo',
            system: 'http://foo.com',
            version: '1.2.3'
          }
        ]
      });
    });

    it('should assign multiple nested elements that are assigned by pattern[x] from a parent on the SD', () => {
      const assignedValRule = new AssignmentRule('maritalStatus.coding');
      assignedValRule.value = new FshCode('foo', 'http://foo.com');
      patient.rules.push(assignedValRule);
      const instanceAssignedValRule = new AssignmentRule('maritalStatus.coding[0].version');
      instanceAssignedValRule.value = '1.2.3';
      patientInstance.rules.push(instanceAssignedValRule);
      const instanceAssignedValRule2 = new AssignmentRule('maritalStatus.coding[1].version');
      instanceAssignedValRule2.value = '3.2.1';
      patientInstance.rules.push(instanceAssignedValRule2);
      const exported = exportInstance(patientInstance);
      expect(exported.maritalStatus).toEqual({
        coding: [
          {
            code: 'foo',
            system: 'http://foo.com',
            version: '1.2.3'
          },
          {
            code: 'foo',
            system: 'http://foo.com',
            version: '3.2.1'
          }
        ]
      });
    });

    it('should assign a nested element that is assigned by array pattern[x] from a parent on the SD', () => {
      const assignedValRule = new AssignmentRule('maritalStatus');
      assignedValRule.value = new FshCode('foo', 'http://foo.com');
      patient.rules.push(assignedValRule);
      const instanceAssignedValRule = new AssignmentRule('maritalStatus.coding[0].version');
      instanceAssignedValRule.value = '1.2.3';
      patientInstance.rules.push(instanceAssignedValRule);
      const exported = exportInstance(patientInstance);
      expect(exported.maritalStatus).toEqual({
        coding: [
          {
            code: 'foo',
            system: 'http://foo.com',
            version: '1.2.3'
          }
        ]
      });
    });

    it('should assign multiple nested elements that are assigned by array pattern[x] from a parent on the SD', () => {
      const assignedValRule = new AssignmentRule('maritalStatus');
      assignedValRule.value = new FshCode('foo', 'http://foo.com');
      patient.rules.push(assignedValRule);
      const instanceAssignedValRule1 = new AssignmentRule('maritalStatus.coding[0].version');
      instanceAssignedValRule1.value = '1.2.3';
      patientInstance.rules.push(instanceAssignedValRule1);
      const instanceAssignedValRule2 = new AssignmentRule('maritalStatus.coding[1].version');
      instanceAssignedValRule2.value = '3.2.1';
      patientInstance.rules.push(instanceAssignedValRule2);
      const exported = exportInstance(patientInstance);
      expect(exported.maritalStatus).toEqual({
        coding: [
          {
            code: 'foo',
            system: 'http://foo.com',
            version: '1.2.3'
          },
          {
            version: '3.2.1'
          }
        ]
      });
    });

    it('should assign cardinality 1..n elements that are assigned by array pattern[x] from a parent on the SD', () => {
      const assignedValRule = new AssignmentRule('maritalStatus');
      assignedValRule.value = new FshCode('foo', 'http://foo.com');
      patient.rules.push(assignedValRule);
      const cardRule = new CardRule('maritalStatus');
      cardRule.min = 1;
      patient.rules.push(cardRule);
      const exported = exportInstance(patientInstance);
      expect(exported.maritalStatus).toEqual({
        coding: [
          {
            code: 'foo',
            system: 'http://foo.com'
          }
        ]
      });
    });

    // TODO: The assignValue functions should be updated to not assign a value when a parent element sets
    // the value to something different using a pattern
    it.skip('should not assign an element to a value different than a parent pattern value on the Structure Definition', () => {
      const assignedValRule = new AssignmentRule('maritalStatus');
      const assignedFshCode = new FshCode('foo', 'http://foo.com');
      assignedValRule.value = assignedFshCode;
      patient.rules.push(assignedValRule);
      const instanceAssignedValRule = new AssignmentRule('maritalStatus.coding[0].system');
      instanceAssignedValRule.value = 'http://bar.com';
      patientInstance.rules.push(instanceAssignedValRule);
      expect(() => exportInstance(patientInstance)).toThrow();
    });

    // Assigning children of primitives
    it('should assign children of primitive values on an instance', () => {
      const assignedValRule = new AssignmentRule('active.id');
      assignedValRule.value = 'foo';
      patientInstance.rules.push(assignedValRule);
      doc.instances.set(patientInstance.name, patientInstance);
      const exported = exportInstance(patientInstance);
      expect(exported._active.id).toBe('foo');
    });

    it('should assign primitive values and their children on an instance', () => {
      const assignedValRule1 = new AssignmentRule('active');
      assignedValRule1.value = true;
      patientInstance.rules.push(assignedValRule1);
      const assignedValRule2 = new AssignmentRule('active.id');
      assignedValRule2.value = 'foo';
      patientInstance.rules.push(assignedValRule2);
      doc.instances.set(patientInstance.name, patientInstance);
      const exported = exportInstance(patientInstance);
      expect(exported.active).toBe(true);
      expect(exported._active.id).toBe('foo');
    });

    it('should assign children of primitive value arrays on an instance', () => {
      const assignedValRule = new AssignmentRule('address[0].line[1].extension[0].url');
      assignedValRule.value = 'foo';
      patientInstance.rules.push(assignedValRule);
      doc.instances.set(patientInstance.name, patientInstance);
      const exported = exportInstance(patientInstance);
      expect(exported.address.length).toBe(1);
      expect(exported.address[0]._line.length).toBe(2);
      expect(exported.address[0]._line[0]).toBeNull();
      expect(exported.address[0]._line[1].extension.length).toBe(1);
      expect(exported.address[0]._line[1].extension[0].url).toBe('foo');
    });

    it('should assign children of primitive value arrays on an instance with out of order rules', () => {
      const assignedValRule1 = new AssignmentRule('address[0].line[1].extension[0].url');
      assignedValRule1.value = 'bar';
      patientInstance.rules.push(assignedValRule1);
      const assignedValRule2 = new AssignmentRule('address[0].line[0].extension[0].url');
      assignedValRule2.value = 'foo';
      patientInstance.rules.push(assignedValRule2);
      doc.instances.set(patientInstance.name, patientInstance);
      const exported = exportInstance(patientInstance);
      expect(exported.address.length).toBe(1);
      expect(exported.address[0]._line.length).toBe(2);
      expect(exported.address[0]._line[0].extension.length).toBe(1);
      expect(exported.address[0]._line[0].extension[0].url).toBe('foo');
      expect(exported.address[0]._line[1].extension.length).toBe(1);
      expect(exported.address[0]._line[1].extension[0].url).toBe('bar');
    });

    it('should assign children of sliced primitive arrays on an instance', () => {
      const caretRule = new CaretValueRule('name.prefix');
      caretRule.caretPath = 'slicing.discriminator.type';
      caretRule.value = new FshCode('value');
      const containsRule = new ContainsRule('name.prefix');
      containsRule.items = [{ name: 'Dr' }];
      const cardRule = new CardRule('name.prefix');
      cardRule.min = 0;
      cardRule.max = '*';
      // * name.prefix ^slicing.discriminator.type = #value
      // * name.prefix contains Dr 0..*
      patient.rules.push(caretRule, containsRule, cardRule);
      const assignedRule1 = new AssignmentRule('name[0].prefix[Dr][0]');
      assignedRule1.value = 'Doctor';
      const assignedRule2 = new AssignmentRule('name[0].prefix[Dr][1]');
      assignedRule2.value = 'Mister Doctor';
      const assignedRuleChild = new AssignmentRule('name[0].prefix[Dr][1].id');
      assignedRuleChild.value = 'Sir Mister Doctor to you';
      // * name[0].prefix[Dr][0] = "Doctor"
      // * name[0].prefix[Dr][1] = "Mister Doctor"
      // * name[0].prefix[Dr][1].id = "Sir Mister Doctor to you";
      patientInstance.rules.push(assignedRule1, assignedRule2, assignedRuleChild);
      const exported = exportInstance(patientInstance);
      expect(exported.name).toEqual([
        {
          prefix: ['Doctor', 'Mister Doctor'],
          _prefix: [null, { id: 'Sir Mister Doctor to you' }]
        }
      ]);
    });

    // Assigning References
    it('should assign a reference while resolving the Instance being referred to', () => {
      const orgInstance = new Instance('TestOrganization');
      orgInstance.instanceOf = 'Organization';
      const assignedIdRule = new AssignmentRule('id');
      assignedIdRule.value = 'org-id';
      orgInstance.rules.push(assignedIdRule);
      const assignedRefRule = new AssignmentRule('managingOrganization');
      assignedRefRule.value = new FshReference('TestOrganization');
      patientInstance.rules.push(assignedRefRule);
      doc.instances.set(patientInstance.name, patientInstance);
      doc.instances.set(orgInstance.name, orgInstance);
      const exported = exportInstance(patientInstance);
      expect(exported.managingOrganization).toEqual({
        reference: 'Organization/org-id'
      });
    });

    it('should assign a reference to a contained resource using a relative reference', () => {
      const orgInstance = new Instance('TestOrganization');
      orgInstance.instanceOf = 'Organization';
      const assignedIdRule = new AssignmentRule('id');
      assignedIdRule.value = 'org-id';
      orgInstance.rules.push(assignedIdRule);
      const containedRule = new AssignmentRule('contained');
      containedRule.value = 'TestOrganization';
      containedRule.isInstance = true;
      const assignedRefRule = new AssignmentRule('managingOrganization');
      assignedRefRule.value = new FshReference('TestOrganization');
      patientInstance.rules.push(containedRule, assignedRefRule);
      doc.instances.set(patientInstance.name, patientInstance);
      doc.instances.set(orgInstance.name, orgInstance);
      const exported = exportInstance(patientInstance);
      expect(exported.managingOrganization).toEqual({
        reference: '#org-id'
      });
    });

    it('should assign a reference without replacing if the referred Instance does not exist', () => {
      const assignedRefRule = new AssignmentRule('managingOrganization');
      assignedRefRule.value = new FshReference('http://hl7.org/fhir/us/minimal');
      patientInstance.rules.push(assignedRefRule);
      doc.instances.set(patientInstance.name, patientInstance);
      const exported = exportInstance(patientInstance);
      expect(exported.managingOrganization).toEqual({
        reference: 'http://hl7.org/fhir/us/minimal'
      });
    });

    it('should assign a reference to a type based on a profile', () => {
      const basePatientInstance = new Instance('BasePatient');
      basePatientInstance.instanceOf = 'Patient';
      doc.instances.set(basePatientInstance.name, basePatientInstance);

      // us-core-observation-lab constrains subject to be a reference to a us-core-patient
      // However, any patient instance can be assigned (because it might conform to the us-core-patient profile without explicitly specifying the profile)
      const profiledInstance = new Instance('MyExampleObservation');
      profiledInstance.instanceOf =
        'http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab';
      const assignedRefRule = new AssignmentRule('subject');
      assignedRefRule.value = new FshReference('BasePatient');
      profiledInstance.rules.push(assignedRefRule); // * subject = Reference(BasePatient)
      doc.instances.set(profiledInstance.name, profiledInstance);

      const exported = exportInstance(profiledInstance);
      expect(exported.subject).toEqual({
        reference: 'Patient/BasePatient'
      });
    });

    it('should assign a reference when the type has no targetProfile', () => {
      const referencedPatientInstance = new Instance('ReferencedPatient');
      referencedPatientInstance.instanceOf = 'Patient';
      doc.instances.set(referencedPatientInstance.name, referencedPatientInstance);

      const assignedRefRule = new AssignmentRule('extension.valueReference');
      assignedRefRule.value = new FshReference('ReferencedPatient');
      patientInstance.rules.push(assignedRefRule); // * extension.valueReference = Reference(BasePatient)

      const exported = exportInstance(patientInstance);
      expect(exported.extension[0].valueReference).toEqual({
        reference: 'Patient/ReferencedPatient'
      });
    });

    it('should log an error when an invalid reference is assigned', () => {
      const observationInstance = new Instance('TestObservation');
      observationInstance.instanceOf = 'Observation';
      doc.instances.set(observationInstance.name, observationInstance);
      const assignedRefRule = new AssignmentRule('contact[0].organization');
      assignedRefRule.value = new FshReference('TestObservation');
      // * contact[0].organization = Reference(TestObservation)
      patientInstance.rules.push(assignedRefRule);
      doc.instances.set(patientInstance.name, patientInstance);

      const exported = exportInstance(patientInstance);
      expect(exported.contact).toEqual(undefined); // Contact is not set with invalid type
      expect(loggerSpy.getAllMessages('error')).toHaveLength(1);
      expect(loggerSpy.getLastMessage('error')).toMatch(
        /The type "Reference\(Observation\)" does not match any of the allowed types\D*/s
      );
    });

    it('should log an error when assigning an invalid reference to a type based on a profile', () => {
      const groupInstance = new Instance('MyGroup');
      groupInstance.instanceOf = 'Group';
      doc.instances.set(groupInstance.name, groupInstance);

      // us-core-observation-lab subject can only be a us-core-patient
      // Group, Device, and Location are allowed reference types on base Patient, but not this profile
      const profiledInstance = new Instance('MyExampleObservation');
      profiledInstance.instanceOf =
        'http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab';
      const assignedRefRule = new AssignmentRule('subject');
      assignedRefRule.value = new FshReference('MyGroup'); // * subject = Reference(MyGroup)
      profiledInstance.rules.push(assignedRefRule);
      doc.instances.set(profiledInstance.name, profiledInstance);

      const exported = exportInstance(profiledInstance);
      expect(exported.subject).toEqual(undefined);
      expect(loggerSpy.getMessageAtIndex(0, 'error')).toMatch(
        /The type "Reference\(Group\)" does not match any of the allowed types\D*/s
      );
    });

    it('should assign a reference to a child type of the referenced type', () => {
      const documentReferenceInstance = new Instance('MyDocReference');
      documentReferenceInstance.instanceOf = 'DocumentReference';
      doc.instances.set(documentReferenceInstance.name, documentReferenceInstance);

      // DocumentReference.context.related is a reference to Any
      const assignedRefRule = new AssignmentRule('context.related');
      assignedRefRule.value = new FshReference('Bar'); // Bar is a Patient Instance that has a TestPatient profile
      documentReferenceInstance.rules.push(assignedRefRule); // * context.related = Reference(Bar)

      const exported = exportInstance(documentReferenceInstance);
      expect(exported.context.related).toEqual([
        {
          reference: 'Patient/Bar'
        }
      ]);
    });

    it('should log an error if an instance of a parent type is assigned', () => {
      const resourceInstance = new Instance('MyGeneralResource');
      resourceInstance.instanceOf = 'Resource';
      doc.instances.set(resourceInstance.name, resourceInstance);

      // Subject can be a reference to Patient, Group, Device, or Location, which are all Resources
      // However, the reference must be to an instance of one of those types, not a generic Resource instance
      const observationInstance = new Instance('MyObservation');
      observationInstance.instanceOf = 'Observation';
      const assignedRefRule = new AssignmentRule('subject');
      assignedRefRule.value = new FshReference('MyGeneralResource'); // * subject = Reference(MyGeneralResource)
      observationInstance.rules.push(assignedRefRule);
      doc.instances.set(observationInstance.name, observationInstance);

      const exported = exportInstance(observationInstance);
      expect(exported.subject).toEqual(undefined);
      expect(loggerSpy.getMessageAtIndex(0, 'error')).toMatch(
        /The type "Reference\(Resource\)" does not match any of the allowed types\D*/s
      );
    });

    // Assigning using Canonical
    it('should apply an Assignment rule with a valid Canonical entity defined in FSH', () => {
      const observationInstance = new Instance('MyObservation');
      observationInstance.instanceOf = 'Observation';
      doc.instances.set(observationInstance.name, observationInstance);

      const assignedValueRule = new AssignmentRule('code.coding.system');
      assignedValueRule.value = new FshCanonical('VeryRealCodeSystem');
      observationInstance.rules.push(assignedValueRule);

      const realCodeSystem = new FshCodeSystem('VeryRealCodeSystem');
      doc.codeSystems.set(realCodeSystem.name, realCodeSystem);

      const exported = exportInstance(observationInstance);
      expect(exported.code).toEqual({
        coding: [{ system: 'http://hl7.org/fhir/us/minimal/CodeSystem/VeryRealCodeSystem' }]
      });
    });

    it('should apply an Assignment rule with Canonical of a FHIR entity', () => {
      const observationInstance = new Instance('MyObservation');
      observationInstance.instanceOf = 'Observation';
      doc.instances.set(observationInstance.name, observationInstance);

      const assignedValueRule = new AssignmentRule('code.coding.system');
      assignedValueRule.value = new FshCanonical('MedicationRequest');
      observationInstance.rules.push(assignedValueRule);

      const exported = exportInstance(observationInstance);
      expect(exported.code).toEqual({
        coding: [{ system: 'http://hl7.org/fhir/StructureDefinition/MedicationRequest' }]
      });
    });

    it('should not apply an Assignment rule with an invalid Canonical entity and log an error', () => {
      const observationInstance = new Instance('MyObservation');
      observationInstance.instanceOf = 'Observation';
      doc.instances.set(observationInstance.name, observationInstance);

      const assignedValueRule = new AssignmentRule('code.coding.system');
      assignedValueRule.value = new FshCanonical('FakeCodeSystem');
      observationInstance.rules.push(assignedValueRule);

      const exported = exportInstance(observationInstance);
      expect(exported.code).toEqual(undefined);
      expect(loggerSpy.getFirstMessage('error')).toMatch(
        /Cannot use canonical URL of FakeCodeSystem because it does not exist.\D*/s
      );
    });

    // Assigning codes from local systems
    it('should assign a code to a top level element while replacing the local code system name with its url', () => {
      const brightInstance = new Instance('BrightObservation');
      brightInstance.instanceOf = 'Observation';
      const assignedCodeRule = new AssignmentRule('code');
      assignedCodeRule.value = new FshCode('bright', 'Visible');
      brightInstance.rules.push(assignedCodeRule);
      doc.instances.set(brightInstance.name, brightInstance);

      const visibleSystem = new FshCodeSystem('Visible');
      doc.codeSystems.set(visibleSystem.name, visibleSystem);
      const exported = exportInstance(brightInstance);
      expect(exported.code.coding).toEqual([
        {
          code: 'bright',
          system: 'http://hl7.org/fhir/us/minimal/CodeSystem/Visible'
        }
      ]);
    });

    it('should assign a code to a nested element while replacing the local code system name with its url', () => {
      const brightInstance = new Instance('BrightObservation');
      brightInstance.instanceOf = 'Observation';
      const assignedCodeRule = new AssignmentRule('component[0].code');
      assignedCodeRule.value = new FshCode('bright', 'Visible');
      brightInstance.rules.push(assignedCodeRule);
      doc.instances.set(brightInstance.name, brightInstance);

      const visibleSystem = new FshCodeSystem('Visible');
      doc.codeSystems.set(visibleSystem.name, visibleSystem);
      const exported = exportInstance(brightInstance);
      expect(exported.component[0].code.coding).toEqual([
        {
          code: 'bright',
          system: 'http://hl7.org/fhir/us/minimal/CodeSystem/Visible'
        }
      ]);
    });

    // Assigning Quantities to Quantity specializations (e.g., Age)
    it('should assign a Quantity to a Quantity specialization', () => {
      const conditionInstance = new Instance('SomeCondition');
      conditionInstance.instanceOf = 'Condition';
      const assignedAgeRule = new AssignmentRule('onsetAge');
      assignedAgeRule.value = new FshQuantity(
        42.0,
        new FshCode('a', 'http://unitsofmeasure.org', 'years')
      );
      conditionInstance.rules.push(assignedAgeRule);
      doc.instances.set(conditionInstance.name, conditionInstance);
      const exported = exportInstance(conditionInstance);
      expect(exported.onsetAge).toEqual({
        value: 42.0,
        code: 'a',
        system: 'http://unitsofmeasure.org',
        unit: 'years'
      });
    });

    // Sliced elements
    it('should assign a single sliced element to a value', () => {
      const assignedValRule = new AssignmentRule('extension[level].valueCoding.system');
      assignedValRule.value = 'foo';
      patientProfInstance.rules.push(assignedValRule);
      const exported = exportInstance(patientProfInstance);
      expect(exported.extension).toEqual([{ url: 'level', valueCoding: { system: 'foo' } }]);
    });

    it('should assign a single primitive sliced element to a value', () => {
      const caretRule = new CaretValueRule('name.prefix');
      caretRule.caretPath = 'slicing.discriminator.type';
      caretRule.value = new FshCode('value');
      const containsRule = new ContainsRule('name.prefix');
      containsRule.items = [{ name: 'Dr' }];
      const cardRule = new CardRule('name.prefix');
      cardRule.min = 1;
      cardRule.max = '1';
      // * name.prefix ^slicing.discriminator.type = #value
      // * name.prefix contains Dr 1..1
      patient.rules.push(caretRule, containsRule, cardRule);
      const assignedRule = new AssignmentRule('name[0].prefix[Dr]');
      assignedRule.value = 'Doctor';
      // * name[0].prefix[Dr] = "Doctor"
      patientInstance.rules.push(assignedRule);
      const exported = exportInstance(patientInstance);
      expect(exported.name).toEqual([
        {
          prefix: ['Doctor']
        }
      ]);
    });

    it('should assign sliced elements in an array that are assigned in order', () => {
      const fooRule = new AssignmentRule('extension[type][0].valueCoding.system');
      fooRule.value = 'foo';
      patientProfInstance.rules.push(fooRule);
      const barRule = new AssignmentRule('extension[type][1].valueCoding.system');
      barRule.value = 'bar';
      patientProfInstance.rules.push(barRule);
      const exported = exportInstance(patientProfInstance);
      expect(exported.extension).toEqual([
        { url: 'type', valueCoding: { system: 'foo' } },
        { url: 'type', valueCoding: { system: 'bar' } }
      ]);
    });

    it('should assign a sliced primitive array', () => {
      const caretRule = new CaretValueRule('name.prefix');
      caretRule.caretPath = 'slicing.discriminator.type';
      caretRule.value = new FshCode('value');
      const containsRule = new ContainsRule('name.prefix');
      containsRule.items = [{ name: 'Dr' }];
      const cardRule = new CardRule('name.prefix');
      cardRule.min = 0;
      cardRule.max = '*';
      // * name.prefix ^slicing.discriminator.type = #value
      // * name.prefix contains Dr 0..*
      patient.rules.push(caretRule, containsRule, cardRule);
      const assignedRule1 = new AssignmentRule('name[0].prefix[Dr][0]');
      assignedRule1.value = 'Doctor';
      const assignedRule2 = new AssignmentRule('name[0].prefix[Dr][1]');
      assignedRule2.value = 'Mister Doctor';
      // * name[0].prefix[Dr][0] = "Doctor"
      // * name[0].prefix[Dr][1] = "Mister Doctor"
      patientInstance.rules.push(assignedRule1, assignedRule2);
      const exported = exportInstance(patientInstance);
      expect(exported.name).toEqual([
        {
          prefix: ['Doctor', 'Mister Doctor']
        }
      ]);
    });

    it('should assign a sliced element in an array that is assigned by multiple rules', () => {
      const fooRule = new AssignmentRule('extension[type][1].valueCoding.system');
      fooRule.value = 'foo';
      patientProfInstance.rules.push(fooRule);
      const barRule = new AssignmentRule('extension[type][1].valueCoding.version');
      barRule.value = '1.2.3';
      patientProfInstance.rules.push(barRule);
      const exported = exportInstance(patientProfInstance);
      expect(exported.extension).toEqual([
        { url: 'type' },
        { url: 'type', valueCoding: { system: 'foo', version: '1.2.3' } }
      ]);
    });

    it('should assign sliced elements in an array that are assigned out of order', () => {
      const fooRule = new AssignmentRule('extension[type][1].valueCoding.system');
      fooRule.value = 'foo';
      patientProfInstance.rules.push(fooRule);
      const barRule = new AssignmentRule('extension[type][0].valueCoding.system');
      barRule.value = 'bar';
      patientProfInstance.rules.push(barRule);
      const exported = exportInstance(patientProfInstance);
      expect(exported.extension).toEqual([
        { url: 'type', valueCoding: { system: 'bar' } },
        { url: 'type', valueCoding: { system: 'foo' } }
      ]);
    });

    it('should assign sliced elements in an array and fill empty values', () => {
      const fooRule = new AssignmentRule('extension[type][1].valueCoding.system');
      fooRule.value = 'foo';
      patientProfInstance.rules.push(fooRule);
      const exported = exportInstance(patientProfInstance);
      expect(exported.extension).toEqual([
        { url: 'type' },
        { url: 'type', valueCoding: { system: 'foo' } }
      ]);
    });

    it('should assign mixed sliced elements in an array', () => {
      const fooRule = new AssignmentRule('extension[type][0].valueCoding.system');
      fooRule.value = 'foo';
      patientProfInstance.rules.push(fooRule);
      const bazRule = new AssignmentRule('extension[level].valueCoding.system');
      bazRule.value = 'baz';
      patientProfInstance.rules.push(bazRule);
      const barRule = new AssignmentRule('extension[type][1].valueCoding.system');
      barRule.value = 'bar';
      patientProfInstance.rules.push(barRule);
      const exported = exportInstance(patientProfInstance);
      expect(exported.extension).toEqual([
        { url: 'type', valueCoding: { system: 'foo' } },
        { url: 'level', valueCoding: { system: 'baz' } },
        { url: 'type', valueCoding: { system: 'bar' } }
      ]);
    });

    it('should assign mixed sliced elements in an array out of order', () => {
      const fooRule = new AssignmentRule('extension[type][1].valueCoding.system');
      fooRule.value = 'foo';
      patientProfInstance.rules.push(fooRule);
      const bazRule = new AssignmentRule('extension[level].valueCoding.system');
      bazRule.value = 'baz';
      patientProfInstance.rules.push(bazRule);
      const barRule = new AssignmentRule('extension[type][0].valueCoding.system');
      barRule.value = 'bar';
      patientProfInstance.rules.push(barRule);
      const exported = exportInstance(patientProfInstance);
      expect(exported.extension).toEqual([
        { url: 'type', valueCoding: { system: 'bar' } },
        { url: 'type', valueCoding: { system: 'foo' } },
        { url: 'level', valueCoding: { system: 'baz' } }
      ]);
    });

    it('should assign a sliced extension element that is referred to by name', () => {
      const fooExtension = new Extension('FooExtension');
      doc.extensions.set(fooExtension.name, fooExtension);
      const containsRule = new ContainsRule('extension');
      containsRule.items = [{ name: 'foo', type: 'FooExtension' }];
      patientProf.rules.push(containsRule);
      const barRule = new AssignmentRule('extension[foo].valueString');
      barRule.value = 'bar';
      patientProfInstance.rules.push(barRule);
      const exported = exportInstance(patientProfInstance);
      expect(exported.extension).toEqual([
        {
          url: 'http://hl7.org/fhir/us/minimal/StructureDefinition/FooExtension',
          valueString: 'bar'
        }
      ]);
    });

    it('should assign a sliced extension element that is referred to by url', () => {
      const fooExtension = new Extension('FooExtension');
      doc.extensions.set(fooExtension.name, fooExtension);
      const containsRule = new ContainsRule('extension');
      containsRule.items = [{ name: 'foo', type: 'FooExtension' }];
      patientProf.rules.push(containsRule);
      const barRule = new AssignmentRule(
        'extension[http://hl7.org/fhir/us/minimal/StructureDefinition/FooExtension].valueString'
      );
      barRule.value = 'bar';
      patientProfInstance.rules.push(barRule);
      const exported = exportInstance(patientProfInstance);
      expect(exported.extension).toEqual([
        {
          url: 'http://hl7.org/fhir/us/minimal/StructureDefinition/FooExtension',
          valueString: 'bar'
        }
      ]);
    });

    it('should assign a sliced extension element that is referred to by aliased url', () => {
      const fooExtension = new Extension('FooExtension');
      doc.aliases.set(
        'FooAlias',
        'http://hl7.org/fhir/us/minimal/StructureDefinition/FooExtension'
      );
      doc.extensions.set(fooExtension.name, fooExtension);
      const containsRule = new ContainsRule('extension');
      containsRule.items = [{ name: 'foo', type: 'FooExtension' }];
      patientProf.rules.push(containsRule);
      const barRule = new AssignmentRule('extension[FooAlias].valueString');
      barRule.value = 'bar';
      patientProfInstance.rules.push(barRule);
      const exported = exportInstance(patientProfInstance);
      expect(exported.extension).toEqual([
        {
          url: 'http://hl7.org/fhir/us/minimal/StructureDefinition/FooExtension',
          valueString: 'bar'
        }
      ]);
    });

    it('should assign an extension that is defined but not present on the SD', () => {
      const fooExtension = new Extension('FooExtension');
      doc.aliases.set(
        'FooAlias',
        'http://hl7.org/fhir/us/minimal/StructureDefinition/FooExtension'
      );
      doc.extensions.set(fooExtension.name, fooExtension);
      const barRule = new AssignmentRule('extension[FooAlias].valueString');
      barRule.value = 'bar';
      patientInstance.rules.push(barRule);
      const exported = exportInstance(patientInstance);
      expect(exported.extension).toEqual([
        {
          url: 'http://hl7.org/fhir/us/minimal/StructureDefinition/FooExtension',
          valueString: 'bar'
        }
      ]);
    });

    it('should not assign an extension that is not defined and not present on the SD', () => {
      const barRule = new AssignmentRule('extension[FooAlias].valueString');
      barRule.value = 'bar';
      patientInstance.rules.push(barRule);
      const exported = exportInstance(patientInstance);
      expect(exported.extension).toBeUndefined();
    });

    it.skip('should throw when ordered is set in the discriminator but slices arrive out of order', () => {
      const assignedValRule = new AssignmentRule('result[Triglyceride].display');
      assignedValRule.value = 'foo';
      lipidInstance.rules.push(assignedValRule);
      // Feel free to change this error message when actually implementing
      expect(() => exportInstance(lipidInstance)).toThrow(
        'Slice Triglyceride of result assigned out of order'
      );
    });

    it.skip('should throw if incorrect elements are added when the slicing is closed', () => {
      const assignedValRule = new AssignmentRule('result[0].display');
      assignedValRule.value = 'foo';
      lipidInstance.rules.push(assignedValRule);
      expect(() => exportInstance(lipidInstance)).toThrow(
        'Slicing on result is closed, only named slices may be added'
      );
    });

    it.skip('should assign sliced elements on a sliced primitive', () => {
      /* Need example of sliced primitive */
    });

    // Content Reference
    it('should assign a child of a contentReference element', () => {
      const barRule = new AssignmentRule('compose.exclude.version');
      barRule.value = 'bar';
      valueSetInstance.rules.push(barRule);
      const exported = exportInstance(valueSetInstance);
      expect(exported.compose).toEqual({
        exclude: [
          {
            version: 'bar'
          }
        ]
      });
    });

    // Validating required elements
    it('should log an error when a required element is not present', () => {
      const cardRule = new CardRule('active');
      cardRule.min = 1;
      cardRule.max = '1';
      patient.rules.push(cardRule);
      exportInstance(patientInstance);
      expect(loggerSpy.getLastMessage('error')).toMatch(
        /Patient.active.*File: PatientInstance\.fsh.*Line: 10 - 20/s
      );
    });

    it('should log multiple errors when multiple required elements are not present', () => {
      const cardRule1 = new CardRule('active');
      cardRule1.min = 1;
      cardRule1.max = '1';
      patient.rules.push(cardRule1);
      const cardRule2 = new CardRule('gender');
      cardRule2.min = 1;
      cardRule2.max = '1';
      patient.rules.push(cardRule2);
      exportInstance(patientInstance);
      const messages = loggerSpy.getAllMessages('error');
      expect(messages[messages.length - 2]).toMatch(
        /Patient.active.*File: PatientInstance\.fsh.*Line: 10 - 20/s
      );
      expect(messages[messages.length - 1]).toMatch(
        /Patient.gender.*File: PatientInstance\.fsh.*Line: 10 - 20/s
      );
    });

    it('should log an error when an element required by an incomplete assigned parent is not present', () => {
      const cardRule = new CardRule('maritalStatus.text');
      cardRule.min = 1;
      cardRule.max = '1';
      patient.rules.push(cardRule);
      const assignedValueRule = new AssignmentRule('maritalStatus');
      assignedValueRule.value = new FshCode('foo');
      patientInstance.rules.push(assignedValueRule);
      exportInstance(patientInstance);
      expect(loggerSpy.getLastMessage('error')).toMatch(
        /Patient.maritalStatus.text.*File: PatientInstance\.fsh.*Line: 10 - 20/s
      );
    });

    it('should log an error for a parent only when a required parent is not present', () => {
      const cardRule1 = new CardRule('maritalStatus.text');
      cardRule1.min = 1;
      cardRule1.max = '1';
      patient.rules.push(cardRule1);
      const cardRule2 = new CardRule('maritalStatus');
      cardRule2.min = 1;
      cardRule2.max = '1';
      patient.rules.push(cardRule2);
      exportInstance(patientInstance);
      expect(loggerSpy.getLastMessage('error')).toMatch(
        /Patient.maritalStatus.*File: PatientInstance\.fsh.*Line: 10 - 20/s
      );
    });

    it('should log an error when an array does not have all required elements', () => {
      const cardRule = new CardRule('contact');
      cardRule.min = 2;
      cardRule.max = '*';
      patient.rules.push(cardRule);
      const assignedValueRule = new AssignmentRule('contact[0].gender');
      assignedValueRule.value = new FshCode('F');
      patientInstance.rules.push(assignedValueRule);
      exportInstance(patientInstance);
      expect(loggerSpy.getLastMessage('error')).toMatch(
        /Patient.contact.*File: PatientInstance\.fsh.*Line: 10 - 20/s
      );
    });

    it('should log an error multiple times for an element missing required elements in an array', () => {
      const cardRule = new CardRule('contact.gender');
      cardRule.min = 1;
      cardRule.max = '1';
      patient.rules.push(cardRule);
      const assignedValueRule1 = new AssignmentRule('contact[0].relationship');
      assignedValueRule1.value = new FshCode('Looking for love');
      patientInstance.rules.push(assignedValueRule1);
      const assignedValueRule2 = new AssignmentRule('contact[1].relationship');
      assignedValueRule2.value = new FshCode('Complicated');
      patientInstance.rules.push(assignedValueRule2);
      exportInstance(patientInstance);
      const messages = loggerSpy.getAllMessages('error');
      expect(messages[messages.length - 2]).toMatch(
        /Patient.contact.gender.*File: PatientInstance\.fsh.*Line: 10 - 20/s
      );
      expect(messages[messages.length - 1]).toMatch(
        /Patient.contact.gender.*File: PatientInstance\.fsh.*Line: 10 - 20/s
      );
    });

    it('should log an error when an [x] element is not present', () => {
      const cardRule = new CardRule('deceased[x]');
      cardRule.min = 1;
      cardRule.max = '1';
      patient.rules.push(cardRule);
      exportInstance(patientInstance);
      const messages = loggerSpy.getAllMessages('error');
      expect(messages[messages.length - 1]).toMatch(
        /Patient.deceased\[x\].*File: PatientInstance\.fsh.*Line: 10 - 20/s
      );
    });

    it('should not log an error when an [x] element is present', () => {
      const originalLength = loggerSpy.getAllMessages('error').length;
      const cardRule = new CardRule('deceased[x]');
      cardRule.min = 1;
      cardRule.max = '1';
      patient.rules.push(cardRule);
      const assignedValueRule = new AssignmentRule('deceasedBoolean');
      assignedValueRule.value = true;
      patientInstance.rules.push(assignedValueRule);
      exportInstance(patientInstance);
      expect(loggerSpy.getAllMessages('error').length).toBe(originalLength);
    });

    it('should log an error when a required sliced element is not present', () => {
      const assignedValueRule = new AssignmentRule('result[Cholesterol]');
      assignedValueRule.value = new FshReference('Fsh are friends');
      lipidInstance.rules.push(assignedValueRule);
      exportInstance(lipidInstance);
      const messages = loggerSpy.getAllMessages('error');
      expect(messages[messages.length - 4]).toMatch(
        /DiagnosticReport.status.*File: LipidInstance\.fsh.*Line: 10 - 20/s
      );
      expect(messages[messages.length - 3]).toMatch(
        /DiagnosticReport.result.*File: LipidInstance\.fsh.*Line: 10 - 20/s
      );
      expect(messages[messages.length - 2]).toMatch(
        /DiagnosticReport.result:Triglyceride.*File: LipidInstance\.fsh.*Line: 10 - 20/s
      );
      expect(messages[messages.length - 1]).toMatch(
        /DiagnosticReport.result:HDLCholesterol.*File: LipidInstance\.fsh.*Line: 10 - 20/s
      );
    });

    it('should log an error when a required element inherited from a resource is not present', () => {
      const observationInstance = new Instance('Pow')
        .withFile('ObservationInstance.fsh')
        .withLocation([10, 1, 20, 30]);
      observationInstance.instanceOf = 'Observation';
      doc.instances.set(observationInstance.name, observationInstance);
      exportInstance(observationInstance);
      const messages = loggerSpy.getAllMessages('error');
      expect(messages[messages.length - 1]).toMatch(
        /Observation.code.*File: ObservationInstance\.fsh.*Line: 10 - 20/s
      );
    });

    it('should log an error when a required element inherited on a profile is not present', () => {
      const observationProfile = new Profile('TestObservation');
      observationProfile.parent = 'Observation';
      doc.profiles.set(observationProfile.name, observationProfile);
      const observationInstance = new Instance('Pow')
        .withFile('ObservationInstance.fsh')
        .withLocation([10, 1, 20, 30]);
      observationInstance.instanceOf = 'TestObservation';
      doc.instances.set(observationInstance.name, observationInstance);
      exportInstance(observationInstance);
      const messages = loggerSpy.getAllMessages('error');
      expect(messages[messages.length - 1]).toMatch(
        /Observation.code.*File: ObservationInstance\.fsh.*Line: 10 - 20/s
      );
    });

    it('should log an error when a required primitive child element is not present', () => {
      const cardRule1 = new CardRule('active.id');
      cardRule1.min = 1;
      cardRule1.max = '1';
      const cardRule2 = new CardRule('active');
      cardRule2.min = 1;
      cardRule2.max = '1';
      // * active.id 1..1
      // * active 1..1
      patient.rules.push(cardRule1, cardRule2);
      const activeRule = new AssignmentRule('active');
      activeRule.value = true;
      // * active = true
      patientInstance.rules.push(activeRule);
      exportInstance(patientInstance);
      expect(loggerSpy.getLastMessage('error')).toMatch(
        /Patient.active.id has minimum cardinality 1 but occurs 0 time\(s\).*File: PatientInstance\.fsh.*Line: 10 - 20/s
      );
    });

    it('should not log an error when a required primitive child element is present', () => {
      const cardRule1 = new CardRule('active.id');
      cardRule1.min = 1;
      cardRule1.max = '1';
      const cardRule2 = new CardRule('active');
      cardRule2.min = 1;
      cardRule2.max = '1';
      // * active.id 1..1
      // * active 1..1
      patient.rules.push(cardRule1, cardRule2);
      const idRule = new AssignmentRule('active.id');
      idRule.value = 'foo';
      // * active.id = "foo"
      patientInstance.rules.push(idRule);
      exportInstance(patientInstance);
      expect(loggerSpy.getAllMessages('error')).toHaveLength(0);
    });

    it('should log an error when a required primitive child array is not large enough', () => {
      const cardRule1 = new CardRule('active.extension');
      cardRule1.min = 2;
      cardRule1.max = '*';
      const cardRule2 = new CardRule('active');
      cardRule2.min = 1;
      cardRule2.max = '1';
      // * active.extension 2..*
      // * active 1..1
      patient.rules.push(cardRule1, cardRule2);
      const activeRule = new AssignmentRule('active');
      activeRule.value = true;
      const extensionRule = new AssignmentRule('active.extension.url');
      extensionRule.value = 'http://example.com';
      // * active = true
      // * active.extension.url = "http://example.com"
      patientInstance.rules.push(activeRule, extensionRule);
      exportInstance(patientInstance);
      expect(loggerSpy.getLastMessage('error')).toMatch(
        /Patient.active.extension has minimum cardinality 2 but occurs 1 time\(s\).*File: PatientInstance\.fsh.*Line: 10 - 20/s
      );
    });

    it('should not log an error when a required primitive child array is large enough', () => {
      const cardRule1 = new CardRule('active.extension');
      cardRule1.min = 1;
      cardRule1.max = '*';
      const cardRule2 = new CardRule('active');
      cardRule2.min = 1;
      cardRule2.max = '1';
      // * active.extension 1..*
      // * active 1..1
      patient.rules.push(cardRule1, cardRule2);
      const idRule = new AssignmentRule('active.extension.url');
      idRule.value = 'http://example.com';
      // * active.extension.url = "http://example.com"
      patientInstance.rules.push(idRule);
      exportInstance(patientInstance);
      expect(loggerSpy.getAllMessages('error')).toHaveLength(0);
    });

    it('should only export an instance once', () => {
      const bundleInstance = new Instance('MyBundle');
      bundleInstance.instanceOf = 'Bundle';
      const inlineRule = new AssignmentRule('entry[0].resource');
      inlineRule.value = 'MyBundledPatient';
      inlineRule.isInstance = true;
      bundleInstance.rules.push(inlineRule); // * entry[0].resource = MyBundledPatient
      doc.instances.set(bundleInstance.name, bundleInstance);

      const inlineInstance = new Instance('MyBundledPatient');
      inlineInstance.instanceOf = 'Patient';
      const assignedValRule = new AssignmentRule('active');
      assignedValRule.value = true;
      inlineInstance.rules.push(assignedValRule); // * active = true
      doc.instances.set(inlineInstance.name, inlineInstance);

      const exported = exporter.export().instances;
      const exportedBundle = exported.filter(i => i._instanceMeta.name === 'MyBundle');
      const exportedBundledPatient = exported.filter(
        i => i._instanceMeta.name === 'MyBundledPatient'
      );
      expect(exportedBundle).toHaveLength(1);
      expect(exportedBundledPatient).toHaveLength(1);
    });

    it('should only add optional children of list elements and the implied elements of those children to entries in the list that assign values on those children', () => {
      // * generalPractitioner only Reference(Practitioner | Organization)
      const onlyRule = new OnlyRule('generalPractitioner');
      onlyRule.types.push(
        {
          type: 'Practitioner',
          isReference: true
        },
        {
          type: 'Organization',
          isReference: true
        }
      );
      // * generalPractitioner.extension contains
      //   http://hl7.org/fhir/StructureDefinition/patient-mothersMaidenName named mothers-maiden-name 0..1
      const containsRule = new ContainsRule('generalPractitioner.extension');
      containsRule.items.push({
        name: 'mothers-maiden-name',
        type: 'http://hl7.org/fhir/StructureDefinition/patient-mothersMaidenName'
      });
      const extensionCard = new CardRule('generalPractitioner.extension[mothers-maiden-name]');
      extensionCard.min = 0;
      extensionCard.max = '1';
      patient.rules.push(containsRule, extensionCard);

      // * generalPractitioner[0] = Reference(my-doctor)
      const gp = new AssignmentRule('generalPractitioner[0]');
      gp.value = new FshReference('my-doctor');
      // * generalPractitioner[1] = Reference(gp-org1)
      const gpOrg = new AssignmentRule('generalPractitioner[1]');
      gpOrg.value = new FshReference('gp-org1');
      // * generalPractitioner[1].extension[mothers-maiden-name].valueString = "Belnades"
      const directValue = new AssignmentRule(
        'generalPractitioner[1].extension[mothers-maiden-name].valueString'
      );
      directValue.value = 'Belnades';
      patientInstance.rules.push(gp, gpOrg, directValue);

      sdExporter.export();
      const result = exportInstance(patientInstance);
      expect(result.generalPractitioner.length).toBe(2);
      expect(result.generalPractitioner[0]).toEqual({
        reference: 'my-doctor'
      });
      expect(result.generalPractitioner[0].extension).toBeUndefined();
      expect(result.generalPractitioner[1]).toEqual({
        reference: 'gp-org1',
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/patient-mothersMaidenName',
            valueString: 'Belnades'
          }
        ]
      });
    });

    describe('#Inline Instances', () => {
      beforeEach(() => {
        const inlineInstance = new Instance('MyInlinePatient');
        inlineInstance.instanceOf = 'Patient';
        const assignedValRule = new AssignmentRule('active');
        assignedValRule.value = true;
        inlineInstance.rules.push(assignedValRule);
        // * active = true
        doc.instances.set(inlineInstance.name, inlineInstance);

        const inlineObservation = new Instance('MyInlineObservation');
        inlineObservation.instanceOf = 'Observation';
        const observationValueRule = new AssignmentRule('valueString');
        observationValueRule.value = 'Some Observation';
        inlineObservation.rules.push(observationValueRule);
        // * valueString = "Some Observation"
        doc.instances.set(inlineObservation.name, inlineObservation);

        const caretRule = new CaretValueRule('entry');
        caretRule.caretPath = 'slicing.discriminator.type';
        caretRule.value = new FshCode('value');
        const containsRule = new ContainsRule('entry');
        containsRule.items = [{ name: 'PatientsOnly' }];
        const cardRule = new CardRule('entry[PatientsOnly]');
        cardRule.min = 0;
        cardRule.max = '1';
        const typeRule = new OnlyRule('entry[PatientsOnly].resource');
        typeRule.types = [{ type: 'Patient' }];

        const choiceContainsRule = new ContainsRule('entry');
        choiceContainsRule.items = [{ name: 'PatientOrOrganization' }];
        const choiceCardRule = new CardRule('entry[PatientOrOrganization]');
        choiceCardRule.min = 0;
        choiceCardRule.max = '1';
        const choiceTypeRule = new OnlyRule('entry[PatientOrOrganization].resource');
        choiceTypeRule.types = [{ type: 'Patient' }, { type: 'Organization' }];
        // * entry ^slicing.discriminator.type = #value
        // * entry contains Patient 0..1
        // * entry[PatientsOnly].resource only Patient
        // * entry contains PatientOrOrganization 0..1
        // * entry[PatientOrOrganization] only Patient or Organization
        bundle.rules.push(
          caretRule,
          containsRule,
          cardRule,
          typeRule,
          choiceContainsRule,
          choiceCardRule,
          choiceTypeRule
        );
      });

      it('should assign an inline resource to an instance', () => {
        const inlineRule = new AssignmentRule('contained[0]');
        inlineRule.value = 'MyInlinePatient';
        inlineRule.isInstance = true;
        patientInstance.rules.push(inlineRule); // * contained[0] = MyInlinePatient

        const exported = exportInstance(patientInstance);
        expect(exported.contained).toEqual([
          { resourceType: 'Patient', id: 'MyInlinePatient', active: true }
        ]);
      });

      it('should assign multiple inline resources to an instance', () => {
        const inlineRule = new AssignmentRule('contained[0]');
        inlineRule.value = 'MyInlinePatient';
        inlineRule.isInstance = true;
        patientInstance.rules.push(inlineRule); // * contained[0] = MyInlinePatient

        const inlineRule2 = new AssignmentRule('contained[1]');
        inlineRule2.value = 'MyInlineObservation';
        inlineRule2.isInstance = true;
        patientInstance.rules.push(inlineRule2); // * contained[1] = MyInlineObservation

        const exported = exportInstance(patientInstance);
        expect(exported.contained).toEqual([
          { resourceType: 'Patient', id: 'MyInlinePatient', active: true },
          {
            resourceType: 'Observation',
            id: 'MyInlineObservation',
            valueString: 'Some Observation'
          }
        ]);
      });

      it('should assign an inline resource to an instance element with a specific type', () => {
        const bundleValRule = new AssignmentRule('entry[PatientsOnly].resource');
        bundleValRule.value = 'MyInlinePatient';
        bundleValRule.isInstance = true;
        // * entry[PatientsOnly].resource = MyInlinePatient
        bundleInstance.rules.push(bundleValRule);

        const exported = exportInstance(bundleInstance);
        expect(exported.entry[0]).toEqual({
          resource: { resourceType: 'Patient', id: 'MyInlinePatient', active: true }
        });
      });

      it('should assign an inline resource to an instance element with a choice type', () => {
        const bundleValRule = new AssignmentRule('entry[PatientOrOrganization].resource');
        bundleValRule.value = 'MyInlinePatient';
        bundleValRule.isInstance = true;
        // * entry[PatientOrOrganization].resource = MyInlinePatient
        bundleInstance.rules.push(bundleValRule);

        const exported = exportInstance(bundleInstance);
        expect(exported.entry[0].resource).toEqual({
          resourceType: 'Patient',
          id: 'MyInlinePatient',
          active: true
        });
      });

      it('should log an error when assigning an inline resource to an invalid choice', () => {
        const bundleValRule = new AssignmentRule('entry[PatientOrOrganization].resource')
          .withFile('BadChoice.fsh')
          .withLocation([1, 2, 3, 4]);
        bundleValRule.value = 'MyInlineObservation';
        bundleValRule.isInstance = true;
        // * entry[PatientOrOrganization].resource = MyInlineObservation
        bundleInstance.rules.push(bundleValRule);

        const exported = exportInstance(bundleInstance);
        expect(exported.entry).toBeUndefined();
        expect(
          loggerSpy
            .getAllMessages('error')
            .some(e =>
              e.match(
                /Cannot assign Observation value: MyInlineObservation. Value does not match element type: Patient, Organization/
              )
            )
        ).toBeTruthy();
      });

      it('should log an error when assigning an inline resource that does not exist to an instance', () => {
        const inlineRule = new AssignmentRule('contained[0]')
          .withFile('FakeInstance.fsh')
          .withLocation([1, 2, 3, 4]);
        inlineRule.value = 'MyFakePatient';
        inlineRule.isInstance = true;
        patientInstance.rules.push(inlineRule); // * contained[0] = MyFakePatient

        const exported = exportInstance(patientInstance);
        expect(exported.contained).toBeUndefined();
        expect(loggerSpy.getLastMessage('error')).toMatch(
          /Cannot find definition for Instance: MyFakePatient. Skipping rule.*File: FakeInstance.fsh.*Line: 1 - 3\D*/s
        );
      });

      it('should override an assigned inline resource on an instance', () => {
        const inlineRule = new AssignmentRule('contained[0]');
        inlineRule.value = 'MyInlinePatient';
        inlineRule.isInstance = true;
        const overrideRule = new AssignmentRule('contained[0].birthDate');
        overrideRule.value = '2000-02-24';
        // * contained[0] = MyInlinePatient
        // * contained[0].birthDate = 2000-02-24
        patientInstance.rules.push(inlineRule, overrideRule);
        const exported = exportInstance(patientInstance);
        expect(exported.contained).toEqual([
          { resourceType: 'Patient', id: 'MyInlinePatient', active: true, birthDate: '2000-02-24' }
        ]);
      });

      it('should override an assigned via resourceType inline resource on an instance', () => {
        const inlineRule = new AssignmentRule('contained[0].resourceType');
        inlineRule.value = 'Patient';
        const overrideRule = new AssignmentRule('contained[0].birthDate');
        overrideRule.value = '2000-02-24';
        // * contained[0].resourceType = "Patient"
        // * contained[0].birthDate = 2000-02-24
        patientInstance.rules.push(inlineRule, overrideRule);
        const exported = exportInstance(patientInstance);
        expect(exported.contained).toEqual([{ resourceType: 'Patient', birthDate: '2000-02-24' }]);
      });

      it('should override an assigned inline resource on an instance with paths that mix usage of [0] indexing', () => {
        const inlineRule = new AssignmentRule('contained[00]'); // [00] index used
        inlineRule.value = 'MyInlinePatient';
        inlineRule.isInstance = true;
        const overrideRule = new AssignmentRule('contained.birthDate'); // no [0] index used
        overrideRule.value = '2000-02-24';
        // * contained[0] = MyInlinePatient
        // * contained.birthDate = 2000-02-24
        patientInstance.rules.push(inlineRule, overrideRule);
        const exported = exportInstance(patientInstance);
        expect(exported.contained).toEqual([
          { resourceType: 'Patient', id: 'MyInlinePatient', active: true, birthDate: '2000-02-24' }
        ]);
      });

      it('should override an assigned via resourceType inline resource on an instance with paths that mix usage of [0] indexing', () => {
        const inlineRule = new AssignmentRule('contained[0].resourceType'); // [0] index used
        inlineRule.value = 'Patient';
        const overrideRule = new AssignmentRule('contained.birthDate'); // no [0] index used
        overrideRule.value = '2000-02-24';
        // * contained.birthDate = 2000-02-24
        // * contained[0].resourceType = "Patient"
        patientInstance.rules.push(overrideRule, inlineRule);
        const exported = exportInstance(patientInstance);
        expect(exported.contained).toEqual([{ resourceType: 'Patient', birthDate: '2000-02-24' }]);
      });

      it('should override a nested assigned inline resource on an instance', () => {
        const bundleRule = new AssignmentRule('contained[0].resourceType');
        bundleRule.value = 'Bundle';
        const patientRule = new AssignmentRule('contained[0].entry[0].resource');
        patientRule.value = 'MyInlinePatient';
        patientRule.isInstance = true;
        const birthDateRule = new AssignmentRule('contained[0].entry[0].resource.birthDate');
        birthDateRule.value = '2000-02-24';
        // * contained[0].resourceType = "Bundle"
        // * contained[0].entry[0].resource = MyInlinePatient
        // * contained[0].entry[0].resource.birthDate = "2000-02-24"
        patientInstance.rules.push(bundleRule, patientRule, birthDateRule);
        const exported = exportInstance(patientInstance);
        expect(exported.contained).toEqual([
          {
            resourceType: 'Bundle',
            entry: [
              {
                resource: {
                  resourceType: 'Patient',
                  id: 'MyInlinePatient',
                  active: true,
                  birthDate: '2000-02-24'
                }
              }
            ]
          }
        ]);
      });

      it('should override an inline profile on an instance', () => {
        const inlineBundle = new Instance('MyBundle');
        inlineBundle.instanceOf = 'TestBundle';
        doc.instances.set(inlineBundle.name, inlineBundle);

        const bundleRule = new AssignmentRule('contained[0]');
        bundleRule.value = 'MyBundle';
        bundleRule.isInstance = true;
        const birthDateRule = new AssignmentRule(
          'contained[0].entry[PatientsOnly].resource.birthDate'
        );
        birthDateRule.value = '2000-02-24';
        // contained[0] = MyBundle
        // contained[0].entry[PatientsOnly].resource.birthDate = "2000-02-24"
        patientInstance.rules.push(bundleRule, birthDateRule);
        const exported = exportInstance(patientInstance);
        expect(exported.contained).toEqual([
          {
            id: 'MyBundle',
            meta: { profile: ['http://hl7.org/fhir/us/minimal/StructureDefinition/TestBundle'] },
            resourceType: 'Bundle',
            entry: [
              {
                resource: {
                  birthDate: '2000-02-24'
                }
              }
            ]
          }
        ]);
      });

      it('should assign an inline instance of a type to an instance', () => {
        const inlineCodeable = new Instance('MyCodeable');
        inlineCodeable.instanceOf = 'CodeableConcept';
        inlineCodeable.usage = 'Inline';
        doc.instances.set(inlineCodeable.name, inlineCodeable);
        const codingRule = new AssignmentRule('coding');
        codingRule.value = new FshCode('foo', 'http://bar.com');
        // * coding = http://bar.com#foo
        inlineCodeable.rules.push(codingRule);

        const inlineRule = new AssignmentRule('maritalStatus');
        inlineRule.value = 'MyCodeable';
        inlineRule.isInstance = true;
        // * maritalStatus = MyCodeable
        patientInstance.rules.push(inlineRule);
        const exported = exportInstance(patientInstance);
        expect(exported.maritalStatus).toEqual({
          coding: [
            {
              system: 'http://bar.com',
              code: 'foo'
            }
          ]
        });
      });

      it('should assign an inline instance of a specialization of a type to an instance', () => {
        const inlineAge = new Instance('MyAge');
        inlineAge.instanceOf = 'Age';
        inlineAge.usage = 'Inline';
        doc.instances.set(inlineAge.name, inlineAge);
        const ageRule = new AssignmentRule('value');
        ageRule.value = 42;
        // * value = 42
        inlineAge.rules.push(ageRule);

        const inlineRule = new AssignmentRule('valueQuantity');
        inlineRule.value = 'MyAge';
        inlineRule.isInstance = true;
        // * valueQuantity = MyAge
        respRateInstance.rules.push(inlineRule);
        const exported = exportInstance(respRateInstance);
        expect(exported.valueQuantity).toEqual({
          value: 42
        });
      });

      it('should not overwrite the value property when assigning a Quantity object', () => {
        const exObservation = new Profile('ExObservation');
        exObservation.parent = 'Observation';
        doc.profiles.set(exObservation.name, exObservation);

        const onlyRule = new OnlyRule('value[x]');
        onlyRule.types = [{ type: 'Quantity' }];
        exObservation.rules.push(onlyRule);

        // * valueQuantity.value = 17
        const valueSettingRule = new AssignmentRule('valueQuantity.value');
        valueSettingRule.value = 17;
        valueSettingRule.isInstance = false;
        valueSettingRule.exactly = false;

        // * valueQuantity = UCUM#/min
        const codeSettingRule = new AssignmentRule('valueQuantity');
        codeSettingRule.value = new FshCode('mg', 'http://unitsofmeasure.org', 'mg');
        codeSettingRule.isInstance = false;
        codeSettingRule.exactly = false;

        const exInstance = new Instance('ExInstance');
        exInstance.instanceOf = 'ExObservation';
        exInstance.rules.push(valueSettingRule);
        exInstance.rules.push(codeSettingRule);

        const exported = exportInstance(exInstance);
        expect(exported.valueQuantity).toEqual({
          value: 17,
          code: 'mg',
          system: 'http://unitsofmeasure.org',
          unit: 'mg'
        });
      });

      it('should assign an inline instance of a profile of a type to an instance', () => {
        const inlineSimple = new Instance('MySimple');
        inlineSimple.instanceOf = 'SimpleQuantity';
        inlineSimple.usage = 'Inline';
        doc.instances.set(inlineSimple.name, inlineSimple);
        const quantRule = new AssignmentRule('value');
        quantRule.value = 7;
        // * value = 7
        inlineSimple.rules.push(quantRule);

        const inlineRule = new AssignmentRule('valueQuantity');
        inlineRule.value = 'MySimple';
        inlineRule.isInstance = true;
        // * valueQuantity = MySimple
        respRateInstance.rules.push(inlineRule);
        const exported = exportInstance(respRateInstance);
        expect(exported.valueQuantity).toEqual({
          value: 7
        });
      });

      it('should assign an inline instance of a FSH defined profile of a type to an instance', () => {
        const profile = new Profile('Foo');
        profile.parent = 'Quantity';
        doc.profiles.set(profile.name, profile);

        const inlineSimple = new Instance('MyQuantity');
        inlineSimple.instanceOf = 'Foo';
        inlineSimple.usage = 'Inline';
        doc.instances.set(inlineSimple.name, inlineSimple);
        const quantRule = new AssignmentRule('value');
        quantRule.value = 7;
        // * value = 7
        inlineSimple.rules.push(quantRule);

        const inlineRule = new AssignmentRule('valueQuantity');
        inlineRule.value = 'MyQuantity';
        inlineRule.isInstance = true;
        // * valueQuantity = MyQuantity
        respRateInstance.rules.push(inlineRule);
        const exported = exportInstance(respRateInstance);
        expect(exported.valueQuantity).toEqual({
          value: 7
        });
      });

      it('should assign an inline instance of an extension to an instance', () => {
        patientProfInstance.usage = 'Inline';
        const codingRule = new AssignmentRule('extension[level].valueCoding');
        codingRule.value = new FshCode('foo', 'http://bar.com');
        // * extension[level].valueCoding = http://bar.com#foo
        patientProfInstance.rules.push(codingRule);
        const inlineRule = new AssignmentRule('extension');
        inlineRule.value = 'Baz'; // InstanceOf patientProf defined in beforeEach
        inlineRule.isInstance = true;
        patientInstance.rules.push(inlineRule);
        const exported = exportInstance(patientInstance);
        expect(exported.extension).toEqual([
          {
            extension: [{ url: 'level', valueCoding: { system: 'http://bar.com', code: 'foo' } }],
            url: 'http://hl7.org/fhir/StructureDefinition/patient-proficiency'
          }
        ]);
      });

      it('should assign an instance of a type to an instance and log a warning when the type is not inline', () => {
        const inlineCodeable = new Instance('MyCodeable')
          .withFile('Code.fsh')
          .withLocation([1, 2, 3, 4]);
        inlineCodeable.instanceOf = 'CodeableConcept';
        doc.instances.set(inlineCodeable.name, inlineCodeable);
        const codingRule = new AssignmentRule('coding');
        codingRule.value = new FshCode('foo', 'http://bar.com');
        // * coding = http://bar.com#foo
        inlineCodeable.rules.push(codingRule);

        const inlineRule = new AssignmentRule('maritalStatus');
        inlineRule.value = 'MyCodeable';
        inlineRule.isInstance = true;
        // * maritalStatus = MyCodeable
        patientInstance.rules.push(inlineRule);
        const exported = exportInstance(patientInstance);
        expect(loggerSpy.getAllMessages('warn')).toHaveLength(1);
        expect(loggerSpy.getLastMessage('warn')).toMatch(
          /Instance MyCodeable is not an instance of a resource.*File: Code\.fsh.*Line: 1 - 3\D*/s
        );
        expect(exported.maritalStatus).toEqual({
          coding: [
            {
              system: 'http://bar.com',
              code: 'foo'
            }
          ]
        });
      });
    });
  });

  describe('#export', () => {
    it('should still apply valid rules if one fails', () => {
      const instance = new Instance('UnmeasurableAttribute');
      instance.instanceOf = 'Patient';
      const impossibleRule = new AssignmentRule('impossible');
      impossibleRule.value = 'unmeasurable';
      instance.rules.push(impossibleRule);
      const possibleRule = new AssignmentRule('identifier.value');
      possibleRule.value = 'Pascal';
      instance.rules.push(possibleRule);
      doc.instances.set(instance.name, instance);

      const exported = exporter.export().instances;
      expect(exported.length).toBe(1);
      expect(exported[0].identifier[0].value).toBe('Pascal');
    });

    it('should log a message when the path for a assigned value is not found', () => {
      const instance = new Instance('UnmeasurableAttribute');
      instance.instanceOf = 'Patient';
      const impossibleRule = new AssignmentRule('impossible')
        .withFile('Unmeasurable.fsh')
        .withLocation([3, 8, 3, 28]);
      impossibleRule.value = 'unmeasurable';
      instance.rules.push(impossibleRule);
      doc.instances.set(instance.name, instance);

      const exported = exporter.export().instances;
      expect(exported.length).toBe(1);
      expect(loggerSpy.getLastMessage('error')).toMatch(/File: Unmeasurable\.fsh.*Line: 3\D*/s);
    });
  });

  describe('#Mixins', () => {
    let instance: Instance;
    let mixin: RuleSet;

    beforeEach(() => {
      instance = new Instance('Foo').withFile('Instance.fsh').withLocation([5, 6, 7, 16]);
      instance.instanceOf = 'Patient';
      doc.instances.set(instance.name, instance);

      mixin = new RuleSet('Bar');
      doc.ruleSets.set(mixin.name, mixin);
      instance.mixins.push('Bar');
    });

    it('should apply rules from a single mixin', () => {
      const rule = new AssignmentRule('active');
      rule.value = true;
      mixin.rules.push(rule);

      const exported = exporter.exportInstance(instance);
      expect(exported.active).toBe(true);
    });

    it('should apply rules from multiple mixins in the correct order', () => {
      const rule1 = new AssignmentRule('active');
      rule1.value = true;
      mixin.rules.push(rule1);

      const mixin2 = new RuleSet('Baz');
      doc.ruleSets.set(mixin2.name, mixin2);
      const rule2 = new AssignmentRule('active');
      rule2.value = false;
      mixin2.rules.push(rule2);
      instance.mixins.push('Baz');

      const exported = exporter.exportInstance(instance);
      expect(exported.active).toBe(false);
    });

    it('should emit an error when the path is not found on a mixin rule', () => {
      const rule = new AssignmentRule('activez').withFile('Mixin.fsh').withLocation([1, 2, 3, 12]);
      rule.value = true;
      mixin.rules.push(rule);

      exporter.exportInstance(instance);
      expect(loggerSpy.getLastMessage('error')).toMatch(/activez/);
      expect(loggerSpy.getLastMessage()).toMatch(/File: Mixin\.fsh.*Line: 1 - 3\D*/s);
      expect(loggerSpy.getLastMessage()).toMatch(
        /Applied in File: Instance\.fsh.*Applied on Line: 5 - 7\D*/s
      );
    });

    it('should emit an error when applying an invalid mixin rule', () => {
      const rule = new AssignmentRule('active').withFile('Mixin.fsh').withLocation([1, 2, 3, 12]);
      rule.value = 'some string';
      mixin.rules.push(rule);

      exporter.exportInstance(instance);
      expect(loggerSpy.getLastMessage('error')).toMatch(/some string/);
      expect(loggerSpy.getLastMessage()).toMatch(/File: Mixin\.fsh.*Line: 1 - 3\D*/s);
      expect(loggerSpy.getLastMessage()).toMatch(
        /Applied in File: Instance\.fsh.*Applied on Line: 5 - 7\D*/s
      );
    });

    it('should emit an error when a mixin cannot be found', () => {
      instance.mixins.push('Barz');

      exporter.exportInstance(instance);

      expect(loggerSpy.getLastMessage('error')).toMatch(/Barz/);
      expect(loggerSpy.getLastMessage('error')).toMatch(/File: Instance\.fsh.*Line: 5 - 7\D*/s);
    });

    it('should emit an error when a mixin applies a non-assigned value rule', () => {
      const rule = new CardRule('active').withFile('Mixin.fsh').withLocation([1, 2, 3, 12]);
      rule.min = 0;
      rule.max = '1';
      mixin.rules.push(rule);

      exporter.exportInstance(instance);
      expect(loggerSpy.getLastMessage('error')).toMatch(
        /Rules applied by mixins to an instance must assign a value. Other rules are ignored/
      );
      expect(loggerSpy.getLastMessage()).toMatch(/File: Mixin\.fsh.*Line: 1 - 3\D*/s);
      expect(loggerSpy.getLastMessage()).toMatch(
        /Applied in File: Instance\.fsh.*Applied on Line: 5 - 7\D*/s
      );
    });
  });

  describe('#insertRules', () => {
    let instance: Instance;
    let ruleSet: RuleSet;

    beforeEach(() => {
      instance = new Instance('Foo');
      instance.instanceOf = 'Resource';
      doc.instances.set(instance.name, instance);

      ruleSet = new RuleSet('Bar');
      doc.ruleSets.set(ruleSet.name, ruleSet);
    });

    it('should apply rules from an insert rule', () => {
      // RuleSet: Bar
      // * id = "my-id"
      //
      // Instance: Foo
      // InstanceOf: Resource
      // * insert Bar
      const valueRule = new AssignmentRule('id');
      valueRule.value = 'my-id';
      ruleSet.rules.push(valueRule);

      const insertRule = new InsertRule();
      insertRule.ruleSet = 'Bar';
      instance.rules.push(insertRule);

      const exported = exporter.exportInstance(instance);
      expect(exported.id).toBe('my-id');
    });

    it('should log an error and not apply rules from an invalid insert rule', () => {
      // RuleSet: Bar
      // * ^title = "Wow fancy"
      // * id = "my-id"
      //
      // Instance: Foo
      // InstanceOf: Resource
      // * insert Bar
      const caretRule = new CaretValueRule('').withFile('Caret.fsh').withLocation([1, 2, 3, 4]);
      caretRule.caretPath = 'title';
      caretRule.value = 'Wow fancy';
      const valueRule = new AssignmentRule('id');
      valueRule.value = 'my-id';
      ruleSet.rules.push(caretRule, valueRule);

      const insertRule = new InsertRule().withFile('Insert.fsh').withLocation([5, 6, 7, 8]);
      insertRule.ruleSet = 'Bar';
      instance.rules.push(insertRule);

      const exported = exporter.exportInstance(instance);
      // valueRule is still applied
      expect(exported.id).toBe('my-id');
      expect(loggerSpy.getLastMessage('error')).toMatch(
        /CaretValueRule.*Instance.*File: Caret\.fsh.*Line: 1 - 3.*Applied in File: Insert\.fsh.*Applied on Line: 5 - 7/s
      );
    });
  });
});
