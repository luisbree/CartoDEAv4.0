# Recomendaciones para el Análisis Estadístico Geoespacial

Este documento es una guía conceptual para integrar análisis estadísticos de nivel intermedio a profundo en la aplicación, buscando añadir rigor numérico a la cartografía.

## 1. Tipos de Pruebas y Análisis Estadísticos Recomendados

Podemos organizar las pruebas en categorías, desde las más simples hasta las más complejas:

### A. Estadísticas Descriptivas (Base Fundamental)
*   **Qué es:** Resumir y describir las características principales de un conjunto de datos.
*   **Pruebas:** Media, mediana, desviación estándar, mínimo, máximo, suma, recuento, histogramas de frecuencia.
*   **Utilidad:** Entender la distribución de tus datos (ej. "¿Cuál es la elevación promedio en esta área?") antes de análisis más complejos. Ya tenemos una base de esto en el panel de análisis.

### B. Análisis de Patrones Espaciales (¿Dónde ocurren las cosas?)
*   **Qué es:** Determinar si la distribución de tus entidades en el mapa es aleatoria, agrupada o dispersa.
*   **Pruebas Recomendadas:**
    *   **Índice de Moran Global (Autocorrelación Espacial):** Responde a la pregunta: "¿Los valores altos de mi capa tienden a estar cerca de otros valores altos, y los bajos cerca de los bajos?". Un valor positivo indica agrupamiento (clustering), uno negativo indica dispersión. Es ideal para entender si existe un patrón general en toda el área de estudio.
    *   **Análisis de Hotspots (Getis-Ord Gi\*):** Va un paso más allá del Índice de Moran. En lugar de dar un solo número para toda el área, esta prueba identifica *dónde* están esos agrupamientos. Genera un mapa de "puntos calientes" (clusters de valores altos) y "puntos fríos" (clusters de valores bajos) que son estadísticamente significativos. Es visualmente muy potente.
    *   **Análisis de Distancia al Vecino más Cercano (Average Nearest Neighbor):** Mide la distancia promedio entre cada entidad y su vecino más cercano. Comparando este valor con el de una distribución aleatoria hipotética, se determina si las entidades tienden a agruparse o a dispersarse.

### C. Análisis de Relaciones Espaciales (¿Por qué ocurren las cosas ahí?)
*   **Qué es:** Explorar y modelar las relaciones entre diferentes variables espaciales.
*   **Pruebas Recomendadas:**
    *   **Análisis de Correlación Bivariada:** Similar a lo que empezamos a explorar con el perfil topográfico. Se calcula un coeficiente de correlación (ej. Pearson) entre dos variables (atributos) dentro de las mismas entidades para ver si se mueven juntas (ej. a mayor pendiente, ¿hay mayor erosión?).
    *   **Análisis de Varianza (ANOVA):** Compara las medias (promedios) de una variable numérica entre tres o más grupos definidos por una variable categórica. Responde a la pregunta: "¿Las diferencias en el promedio de mi variable de interés entre estos grupos son estadísticamente significativas?". Es ideal para validar si una categorización (ej. "tipo de uso de suelo") tiene un efecto real sobre una medición (ej. "nivel de contaminación").
    *   **Regresión Geográficamente Ponderada (GWR - Geographically Weighted Regression):** Es una versión "pro" de la regresión lineal. Mientras que una regresión normal te da una sola ecuación para todo el mapa, la GWR te da una ecuación *para cada entidad*, permitiendo que la relación entre variables cambie a lo largo del espacio. Responde a: "¿La relación entre la población y el acceso a servicios es la misma en el centro de la ciudad que en la periferia?".

## 2. Organización y Flujo de Trabajo

Un flujo de trabajo lógico para un analista sería:

1.  **Paso 1: Exploración y Descripción.**
    *   **Insumos:** Una capa vectorial (ej. localidades, parcelas) con atributos numéricos.
    *   **Acción en la App:** Cargar la capa. Usar el **Panel de Estadísticas** para calcular las métricas descriptivas básicas (media, mediana, etc.) y visualizar el histograma. Aplicar una **simbología graduada** (por cuantiles o Jenks) para tener una primera impresión visual de la distribución espacial de los datos.
    *   **Pregunta Clave:** "¿Cómo se distribuyen mis datos? ¿Hay valores atípicos?".

2.  **Paso 2: Análisis de Patrones.**
    *   **Insumos:** La misma capa.
    *   **Acción en la App:** Ir a una nueva sección "Análisis de Patrones" dentro del **Panel de Análisis Espacial**. Ejecutar un **Análisis de Hotspots (Getis-Ord Gi\*)** sobre un atributo de interés.
    *   **Resultado:** Se genera una nueva capa donde cada entidad está coloreada según si es un hotspot, un coldspot, o no es parte de ningún cluster significativo.
    *   **Pregunta Clave:** "¿Existen agrupamientos estadísticamente significativos de valores altos o bajos en mi mapa?".

3.  **Paso 3: Análisis de Relaciones.**
    *   **Insumos:** Una capa con al menos dos atributos numéricos que se sospecha están relacionados, o una capa con una variable numérica y una categórica para ANOVA.
    *   **Acción en la App:**
        *   **Opción A (Simple - Correlación):** Usar la herramienta de **Correlación** para obtener un coeficiente de Pearson y ver la fuerza de la relación entre dos variables numéricas.
        *   **Opción B (Comparación de Grupos - ANOVA):** En una nueva sección "Análisis de Varianza", seleccionar una variable numérica (dependiente) y una categórica (factor/grupo). Ejecutar ANOVA.
        *   **Opción C (Avanzada - GWR):** En una nueva sección "Modelado de Relaciones", seleccionar una variable dependiente y una o más variables independientes. Ejecutar la **Regresión Geográficamente Ponderada**.
    *   **Resultado:**
        *   **Opción A:** Un número (el coeficiente `r`).
        *   **Opción B:** Un valor p que indica si hay diferencias significativas entre los grupos. Se puede acompañar con un gráfico de cajas (box-plot).
        *   **Opción C:** Se genera una nueva capa de salida. Los atributos de esta capa no son los originales, sino los resultados de la regresión para cada entidad: el coeficiente local (ej. `local_r2`), el residuo, etc. Simbolizar esta capa por los residuos es muy útil para ver dónde el modelo funciona bien o mal.
    *   **Pregunta Clave:** "¿Existe una relación entre estas dos variables? ¿El promedio de mi variable difiere entre estos grupos? ¿Y esa relación es constante en todo el mapa?".

## 3. Insumos de Información Necesarios

Para que estos análisis funcionen, la clave está en la calidad de los datos de entrada:

*   **Capas Vectoriales (Puntos, Líneas o Polígonos):** Son la base. Los análisis de patrones y relaciones necesitan geometrías bien definidas.
*   **Atributos Numéricos Ricos:** ¡Fundamental! No podemos hacer estadística sin números. Cada capa debería tener atributos cuantitativos (ej. población, altura, rendimiento de cultivo, nivel de contaminación, valor de la propiedad, etc.).
*   **Atributos Categóricos:** Para análisis como ANOVA, es crucial tener campos que clasifiquen las entidades en grupos (ej. tipo de suelo, jurisdicción, uso de la tierra).
*   **Datos Contiguos o Densos:** Los análisis de autocorrelación y hotspots funcionan mejor cuando las entidades cubren un área de estudio de forma continua (como municipios o parcelas) en lugar de puntos muy dispersos.