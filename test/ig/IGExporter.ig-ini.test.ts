import fs from 'fs-extra';
import path from 'path';
import temp from 'temp';
import cloneDeep from 'lodash/cloneDeep';
import { EOL } from 'os';
import { IGExporter } from '../../src/ig';
import { Package } from '../../src/export';
import { loggerSpy } from '../testhelpers/loggerSpy';
import { minimalConfig } from './fixtures/minimalConfig';
import { Configuration } from '../../src/fshtypes';

describe('IGExporter', () => {
  // Track temp files/folders for cleanup
  temp.track();

  describe('#ig-ini', () => {
    let templatelessConfig: Configuration;
    let tempOut: string;

    beforeAll(() => {
      tempOut = temp.mkdirSync('sushi-test');
    });

    afterAll(() => {
      temp.cleanupSync();
    });

    beforeEach(() => {
      templatelessConfig = cloneDeep(minimalConfig);
      delete templatelessConfig.template;
      loggerSpy.reset();
    });

    it('should do nothing when template is undefined and ig.ini is not provided', () => {
      const pkg = new Package(null, templatelessConfig);
      const igDataPath = path.resolve(__dirname, 'fixtures', 'simple-ig', 'ig-data');
      const exporter = new IGExporter(pkg, null, igDataPath);
      exporter.addIgIni(tempOut);
      const igIniPath = path.join(tempOut, 'ig.ini');
      expect(fs.existsSync(igIniPath)).toBeFalsy();
      expect(loggerSpy.getAllMessages()).toHaveLength(0);
    });

    it('should generate an ig.ini when template is defined in the config', () => {
      const pkg = new Package(null, minimalConfig);
      const igDataPath = path.resolve(__dirname, 'fixtures', 'simple-ig', 'ig-data');
      const exporter = new IGExporter(pkg, null, igDataPath);
      exporter.addIgIni(tempOut);
      const igIniPath = path.join(tempOut, 'ig.ini');
      expect(fs.existsSync(igIniPath)).toBeTruthy();
      const content = fs.readFileSync(igIniPath, 'utf8');
      expect(content).toEqual(
        [
          '[IG]',
          '; ***********************************************************************************************',
          '; *                               WARNING: DO NOT EDIT THIS FILE                                *',
          '; *                                                                                             *',
          '; * This file is generated by SUSHI. Any edits you make to this file will be overwritten.       *',
          '; *                                                                                             *',
          '; * This ig.ini was generated using the template property in config.yaml. To provide your own   *',
          '; * ig.ini, create an ig.ini file in the ig-data folder with required properties: ig, template. *',
          '; * See: https://build.fhir.org/ig/FHIR/ig-guidance/using-templates.html#root                   *',
          '; ***********************************************************************************************',
          'ig = input/ImplementationGuide-fhir.us.minimal.json',
          'template = hl7.fhir.template#0.0.5',
          ''
        ].join(EOL) // Windows: /r/n; Mac: /n
      );
      expect(loggerSpy.getAllMessages()).toHaveLength(1);
      expect(loggerSpy.getLastMessage('info')).toMatch('Generated ig.ini.');
    });

    it('should generate an ig.ini when template is defined in the config and warn if there is also an ig-data/ig.ini file', () => {
      const pkg = new Package(null, minimalConfig);
      const igDataPath = path.resolve(__dirname, 'fixtures', 'customized-ig', 'ig-data');
      const exporter = new IGExporter(pkg, null, igDataPath);
      exporter.addIgIni(tempOut);
      const igIniPath = path.join(tempOut, 'ig.ini');
      expect(fs.existsSync(igIniPath)).toBeTruthy();
      const content = fs.readFileSync(igIniPath, 'utf8');
      expect(content).toEqual(
        [
          '[IG]',
          '; ***********************************************************************************************',
          '; *                               WARNING: DO NOT EDIT THIS FILE                                *',
          '; *                                                                                             *',
          '; * This file is generated by SUSHI. Any edits you make to this file will be overwritten.       *',
          '; *                                                                                             *',
          '; * This ig.ini was generated using the template property in config.yaml. To provide your own   *',
          '; * ig.ini, create an ig.ini file in the ig-data folder with required properties: ig, template. *',
          '; * See: https://build.fhir.org/ig/FHIR/ig-guidance/using-templates.html#root                   *',
          '; ***********************************************************************************************',
          'ig = input/ImplementationGuide-fhir.us.minimal.json',
          'template = hl7.fhir.template#0.0.5',
          ''
        ].join(EOL) // Windows: /r/n; Mac: /n
      );
      expect(loggerSpy.getAllMessages()).toHaveLength(2);
      expect(loggerSpy.getLastMessage('warn')).toMatch(
        `Found both a "template" property in config.yaml and an ig.ini file at ig-data${path.sep}ig.ini.`
      );
      expect(loggerSpy.getLastMessage('info')).toMatch('Generated ig.ini.');
    });

    it('should use user-provided ig.ini when template is not defined', () => {
      const pkg = new Package(null, templatelessConfig);
      const igDataPath = path.resolve(__dirname, 'fixtures', 'customized-ig', 'ig-data');
      const exporter = new IGExporter(pkg, null, igDataPath);
      exporter.addIgIni(tempOut);
      const igIniPath = path.join(tempOut, 'ig.ini');
      expect(fs.existsSync(igIniPath)).toBeTruthy();
      const content = fs.readFileSync(igIniPath, 'utf8');
      expect(content).toEqual(
        [
          '[IG]',
          '; *****************************************************************************************',
          '; *                            WARNING: DO NOT EDIT THIS FILE                             *',
          '; *                                                                                       *',
          '; * This file is generated by SUSHI. Any edits you make to this file will be overwritten. *',
          '; *                                                                                       *',
          '; * To change the contents of this file, edit the original source file at:                *',
          `; * ig-data${path.sep}ig.ini                                                                        *`,
          '; *****************************************************************************************',
          'ig = input/ImplementationGuide-sushi-test.json',
          'template = hl7.fhir.template#0.1.0',
          ''
        ].join(EOL) // Windows: /r/n; Mac: /n
      );
      expect(loggerSpy.getAllMessages()).toHaveLength(1);
      expect(loggerSpy.getLastMessage('info')).toMatch('Copied ig.ini.');
    });

    it('should merge default values into user-provided ig.ini when template is not defined', () => {
      const pkg = new Package(null, templatelessConfig);
      const igDataPath = path.resolve(
        __dirname,
        'fixtures',
        'ig-ini-missing-properties',
        'ig-data'
      );
      const exporter = new IGExporter(pkg, null, igDataPath);
      exporter.addIgIni(tempOut);
      const igIniPath = path.join(tempOut, 'ig.ini');
      expect(fs.existsSync(igIniPath)).toBeTruthy();
      const content = fs.readFileSync(igIniPath, 'utf8');
      expect(content).toEqual(
        [
          '[IG]',
          '; *****************************************************************************************************',
          '; *                                  WARNING: DO NOT EDIT THIS FILE                                   *',
          '; *                                                                                                   *',
          '; * This file is generated by SUSHI. Any edits you make to this file will be overwritten.             *',
          '; *                                                                                                   *',
          '; * This ig.ini was generated by merging in required properties: "ig" and/or "template". Review your  *',
          `; * original ig-data${path.sep}ig.ini file and add the missing required properties.                             *`,
          '; *****************************************************************************************************',
          'usage-stats-opt-out = true',
          'ig = input/ImplementationGuide-fhir.us.minimal.json',
          'template = fhir.base.template',
          ''
        ].join(EOL) // Windows: /r/n; Mac: /n
      );
      expect(loggerSpy.getAllMessages()).toHaveLength(3);
      expect(loggerSpy.getMessageAtIndex(-2, 'warn')).toMatch(
        'The ig.ini file must have an "ig" property'
      );
      expect(loggerSpy.getLastMessage('warn')).toMatch(
        'The ig.ini file must have a "template" property'
      );
      expect(loggerSpy.getLastMessage('info')).toMatch(
        `Merged ig-data${path.sep}ig.ini w/ default values for missing properties.`
      );
    });

    it('should report deprecated properties in user-provided ig.ini when template is not defined', () => {
      const pkg = new Package(null, templatelessConfig);
      const igDataPath = path.resolve(
        __dirname,
        'fixtures',
        'ig-ini-with-deprecated-properties',
        'ig-data'
      );
      const exporter = new IGExporter(pkg, null, igDataPath);
      exporter.addIgIni(tempOut);
      const igIniPath = path.join(tempOut, 'ig.ini');
      expect(fs.existsSync(igIniPath)).toBeTruthy();
      const content = fs.readFileSync(igIniPath, 'utf8');
      expect(content).toEqual(
        [
          '[IG]',
          '; *****************************************************************************************',
          '; *                            WARNING: DO NOT EDIT THIS FILE                             *',
          '; *                                                                                       *',
          '; * This file is generated by SUSHI. Any edits you make to this file will be overwritten. *',
          '; *                                                                                       *',
          '; * To change the contents of this file, edit the original source file at:                *',
          `; * ig-data${path.sep}ig.ini                                                                        *`,
          '; *****************************************************************************************',
          'ig = input/ImplementationGuide-sushi-test.json',
          'template = hl7.fhir.template#0.1.0',
          'usage-stats-opt-out = true',
          'copyrightyear = 2018+',
          'license = CC0-1.0',
          'version = 0.1.0',
          'ballotstatus = STU1',
          'fhirspec = http://hl7.org/fhir/R4/',
          'excludexml = Yes',
          'excludejson = Yes',
          'excludettl = Yes',
          'excludeMaps = Yes',
          ''
        ].join(EOL) // Windows: /r/n; Mac: /n
      );
      expect(loggerSpy.getAllMessages()).toHaveLength(2);
      expect(loggerSpy.getLastMessage('warn')).toMatch(
        `Your ig-data${path.sep}ig.ini file contains the following deprecated properties: ` +
          'copyrightyear, license, version, ballotstatus, fhirspec, excludexml, excludejson, excludettl, excludeMaps.'
      );
      expect(loggerSpy.getLastMessage('info')).toMatch('Copied ig.ini.');
    });
  });
});
