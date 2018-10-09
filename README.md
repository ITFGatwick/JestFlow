# Jest-Flow
![Logo](jest-flow.png)

# Description
This extensions automatically generates sister `.ts` files for the `.feature` files. Inspired by SpecFlow
The user can then use the command `Generate Step` (alt + F12 default) to copy the step to buffer and past it into the appropriate file.
Works very well with the `Cucumber (Gherkin) Full` Support extensions which will enable squgglies for unfound steps and go to definition.

# To use this extension
- run `npm install`
- run `npm install -g vsce`
- run `vsce package` to build the .vsix file
- open VS Code
- select extensions
- click 3 dots (more options) and choose install from VSIX

# Config
  `"jestflow.usejestcucumbergeneration": true / [false],`
  Setting to true will turn off the convention based generation when you save and call through to jest-cucumber's api to generate steps when you press `Alt + F12`. Defaults to `false`;
  
  `"jestflow.stepsfolder": "test"`
  This is the root folder for which your test project lives.
  Inside here if you are using the convention you will have to create the appropriate step files and test hooks.
  
  ## Expected Structure
  ```
  test/
    steps/
      given-steps.ts
      when-steps.ts
      then-steps.ts
    configuration/
      TestHooks.ts
```
```
export class TestHooks {
  static async BeforeEach() {
    //TestIoc.Initialise();
  }

  static async AfterEach() {
    //TestIoc.Reset();
  }
}
```

# Demo 
![Demo](jest-flow-demo.gif)

