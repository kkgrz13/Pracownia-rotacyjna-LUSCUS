import * as THREE from "three";
import {notify} from "./utils.js";
import {exportGLTF, saveLuscusFile} from "./fileWriter.js";
import { Section } from "./section.js";
import { View } from "./view.js";

class Api {
    /**
     * An api object is included in the global scope so that it can be called
     * from the developer console.
     * @param {THREE.Camera} camera
     * @param {THREE.Scene} scene
     * @param {THREE.Renderer} renderer
     * @param {MapControls} controls
     */
    constructor(camera, scene, renderer, controls) {
        this.camera = camera;
        this.scene = scene;
        this.renderer = renderer;
        this.controls = controls;
        this.sections = [];

        this.view = new View(this);
    }

    /**
     * Create a diamond cubic structure
     * @param {number} side Side width in number of unit cells
     * @param {boolean} bonds Include bonds
     */
    clearScene() {
        while(this.scene.children.length > 0){ 
            this.scene.remove(this.scene.children[0]); 
        }
        this.sections = [];
    }
    addDefaultLights() {

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 7.5);
        this.scene.add(ambientLight);
        this.scene.add(directionalLight);
    }
    createDiamond(side=10, bonds=true) {
        this.clearScene();
        this.addDefaultLights();
        const a = 3.567;
        const unitPoints = [
            [0,0,0], [0,2,2], [2,0,2], [2,2,0],
            [3,3,3], [3,1,1], [1,3,1], [1,1,3]
        ].map(p=>new THREE.Vector3(...p));

        const points = [];
        for (let x=0; x<side; x++) {
            for (let y=0; y<side; y++) {
                for (let z=0; z<side; z++) {
                    for (const p of unitPoints) {
                        points.push(
                            new THREE.Vector3(4*x, 4*y, 4*z).add(p)
                        )
                    }
                }
            }
        }

        const section = new Section();
        this.sections.push(section);
        const atoms = points.map(p=>
            this.addAtom(
                "C",
                p.clone().multiplyScalar(a/4),
                undefined,
                section,
                false
            )
        );

        this.view.redrawAtomView();

        if (bonds) {
            // Not the most efficient way of doing it, I'm sure,
            // but easy to implement
            const distLim = 2; // Seems to be about right
            for (let i=0; i<atoms.length; i++) {
                for (let j=i+1; j<atoms.length; j++) {
                    if (atoms[i].position.distanceTo(atoms[j].position) <= distLim) {
                        this.addBond(atoms[i], atoms[j], 1, false, false);
                    }
                }
            }

            this.view.redrawBondView();
        }
        this.render();
    }

    /**
     * Create an atom with electron orbits
     * @param {number} angle Kąt dla animacji orbity
     */
    createOne(angle = 0) {
        // Zmienna do rysowania jądra atomu
        this.clearScene();
        this.addDefaultLights();
        const radius = 0.3;
    
        // Tworzymy geometrię sfery (jądro atomu)
        const geometry = new THREE.SphereGeometry(radius, 20, 20);
        const material = new THREE.MeshBasicMaterial({ color: 0xFF3333 });
        const nucleus = new THREE.Mesh(geometry, material);
    
        // Ustawiamy jądro atomu w scenie
        this.scene.add(nucleus);
    
        // Tworzymy orbity elektronów
        const electronMaterial = new THREE.MeshBasicMaterial({ color: 0x33B5FF });
    
        // Parametry orbity
        const electronRadius = 1.5;
    
        // Tworzymy elektrony na różnych orbitach
        for (let i = 0; i < 3; i++) {
            const electronAngle = angle + i * 120; // różne kąty na orbicie
            const x = Math.cos(electronAngle * Math.PI / 180) * electronRadius;
            const y = Math.sin(electronAngle * Math.PI / 180) * electronRadius;
            const z = 0;  // Orbitujemy na płaszczyźnie XY
    
            // Tworzymy geometrię dla elektronów
            const electronGeometry = new THREE.SphereGeometry(0.1, 10, 10);
            const electron = new THREE.Mesh(electronGeometry, electronMaterial);
    
            // Ustawiamy pozycję elektronu
            electron.position.set(x, y, z);
    
            // Dodajemy elektron do sceny
            this.scene.add(electron);
        }
    
        // Ustawienie kamery i jej widoku
        this.camera.position.set(0, 0, 5);
        this.camera.lookAt(0, 0, 0);
    
        this.view.redrawAtomView();  // Odświeżamy widok atomów
        this.render();  // Renderowanie sceny
    }

    /**
     * Add a new atom
     * @param {string} symbol
     * @param {THREE.Vector3} position
     * @param {Map} attributes
     * @param {Section} section
     * @param {boolean} redraw Redraw atom view or not
     */
    addAtom(symbol, position, attributes = new Map(), section, redraw=true) {
        if (section === undefined) {
            section = new Section();
            this.sections.push(section);
        }
        const atom = {
            sectionIdx: section.atoms.length + 1, // Keep 1-indexed convention?
            symbol: symbol,
            position: position,
            attributes: attributes,
            section: section
        };

        section.atoms.push(atom);

        if (redraw) {
            this.view.redrawAtomView();
            this.render();
        }

        return atom
    }

    /**
     *
     * @param {*} atom1
     * @param {*} atom2
     * @param {number} order
     * @param {boolean} automatic
     * @returns
     */
    addBond(atom1, atom2, order, automatic, redraw=true) {
        if (atom1.section !== atom2.section) {
            console.error("Atoms need to belong to the same section to have a bond");
            return;
        }
        const section = atom1.section;
        section.bonds.push({
            atom1: atom1,
            atom2: atom2,
            order: order,
            automatic: automatic
        });

        if (redraw) {
            this.view.redrawBondView();
            this.render();
        }
    }

    /**
     *
     * @param {{}[]} atoms
     * @param {THREE.Vector3} translation
     * @param {THREE.Quaternion} quaternion
     * @param {THREE.Vector3} origin
     */
    transformAtoms(atoms, translation = new THREE.Vector3(), quaternion, origin) {
        for (const atom of atoms) {
            atom.position.add(translation);
        }

        if (quaternion !== undefined) {
            if (origin === undefined) {
                origin = new THREE.Vector3();
                for (const atom of atoms) {
                    origin.add(atom.position);
                }
                origin.divideScalar(atoms.length);
            }
            for (const atom of atoms) {
                atom.position.sub(origin);
                atom.position.applyQuaternion(quaternion);
                atom.position.add(origin);
            }
        }

        this.view.updateAtomPositions(atoms);

        this.render();
    }

    /**
     * Render the scene
     */
    render() {
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Scales the HTML canvas (used for higher resolution
     * in image and video export).
     * You are meant to scale it back again when the export
     * is done, otherwise things will look odd.
     * @param {number} scalingFactor Multiplier to scale the canvas with
     */
    scaleCanvas(scalingFactor=2) {
        const canvas = this.renderer.domElement;
        const width = canvas.width;
        const height = canvas.height;
        canvas.width = width*scalingFactor;
        canvas.height = height*scalingFactor;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(canvas.width, canvas.height);
        this.render();
    }

    /**
     * Save the current sections to file
     * @param {string} name Filename
     */
    saveLuscusFile(name="file") {
        saveLuscusFile(this.sections, name);
    }

    /**
     * Export the scene as a glTF/glb 3D shape file.
     * @param {THREE.Scene} scene Scene to export
     * @param {boolean} binary Set to true for binary glb or false for plaintext glTF
     * @param {string} name Name for the file @default "scene"
     */
    exportGLTF(scene=this.scene, binary=false, name="scene") {
        exportGLTF(scene, binary, name);
    }

    /**
     * Export image of the current view
     * @param {number} scaleFactor Multiplier to for higher resolution
     */
    exportImage(scaleFactor, name="scene") {
        if (scaleFactor === undefined) {
            scaleFactor = parseFloat((document.getElementById("exportImageScalingFactor")).value);
        }

        let saveImage = () => {
            this.renderer.domElement.toBlob(blob => {
                var a = document.createElement("a");
                var url = URL.createObjectURL(blob);
                a.href = url;
                a.download = name+".png";
                setTimeout(() => a.click(), 10);
            }, "image/png", 1.0);
        };

        // First scale the canvas with the provided factor, then scale it back.
        new Promise(resolve => {
            this.scaleCanvas(scaleFactor);
            resolve("success");
        }).then(() => {
            try {
                saveImage();
            } catch (error) {
                notify("Canvas is too large to save, please try a smaller scaling factor", "alert");
            }
            this.scaleCanvas(1/scaleFactor);
        });
    }

    showVideoExportWindow() {
        // eslint-disable-next-line no-undef
        Metro.window.create({
            title: "Export video",
            place: "center",
            icon: "<span class='mif-video-camera'></span>",
            content: `...` // (content unchanged from previous code)
        });
    }

    // ... pozostałe metody
}

export {Api};
