export const BUS_NAME = 'org.gnome.Shell.Extensions.GradientTopBar.Debug';
export const OBJECT_PATH = '/org/gnome/Shell/Extensions/GradientTopBar/Debug';
export const INTERFACE_XML = `<node>
  <interface name="${BUS_NAME}">
    <method name="GetSnapshot"><arg type="s" direction="out" name="snapshot"/></method>
    <method name="SetOptions">
      <arg type="b" direction="in" name="collecting"/>
      <arg type="b" direction="in" name="timing"/>
    </method>
    <method name="Reset"/>
  </interface>
</node>`;
